# VK API — справочник по структурам ответов VK Музыки

Справочник описывает фактическую структуру JSON-ответов VK Музыки, получаемых через внутренний Android API (`8.154`): конверт каталога, блоки, сущности, таксономию типов и раскладок. Документ сверен эталонным слепком `raw/` (956 вызовов, август 2026) и кодом приложения VK Музыки для Android (библиотека `catalogkit`: 28 типизированных видов блоков, 52 раскладки). Архитектурный ориентир для Rust-типов крейта `vkmux-vk` — модели в `src/catalog/` повторяют эту схему один в один, а roundtrip-тест `tests/catalog_roundtrip.rs` гарантирует нулевую потерю полей.

Правила вызова методов (параметры, ошибки, ограничения) — в файле [`VK-API.md`](./VK-API.md).

Приложения в конце документа: [Приложение A](#приложение-a-типовые-json-объекты) — типовые JSON-объекты каждой сущности, вырезанные из эталонного слепка без изменений; [Приложение B](#приложение-b-сущности-типов-известных-только-по-коду-приложения) — состав пакетов, которые приложение умеет разбирать, но VK ещё ни разу не прислал.

---

## 1. Конверт каталога (главный паттерн)

Методы `catalog.getAudio`, `catalog.getSection`, `catalog.getBlockItems`, `catalog.replaceBlocks`, `catalog.getAudioSearch`, `catalog.getAudioArtist` возвращают данные в формате «конверта». На верхнем уровне ответа располагаются корневые пакеты сущностей, а секции и блоки ссылаются на них по идентификаторам из полей `*_ids`:

```json
{
  "audios": [ { "id": 456239065, "owner_id": 720198974, ... } ],
  "playlists": [ { "id": 117, "owner_id": 423329206, ... } ],
  "section": {
    "id": "PUldVA8FR0Rz...",
    "title": "Главная",
    "url": "https://vk.ru/audios720198974?section=general",
    "next_from": "...",
    "blocks": [
      {
        "id": "PUlQVA8GR0R3...",
        "data_type": "music_audios",
        "layout": { "name": "list", "owner_id": 720198974 },
        "audios_ids": [ "720198974_456239065", ... ]
      }
    ]
  }
}
```

### 1.1. Состав верхнего уровня по типам ответов

Конверт всегда содержит ровно одну из четырёх структурных форм плюс произвольный набор пакетов:

| Форма | Методы | Структурные ключи | Пакеты сущностей |
|---|---|---|---|
| Корневой каталог | `catalog.getAudio` (без url), `catalog.getAudioSearch`, `catalog.getAudioArtist` | `catalog { default_section, sections }` | пусто, либо пакеты единственной секции |
| Детальная секция | `catalog.getSection`, `catalog.getAudio(url)` | `section` | пакеты секции |
| Одиночный блок | `catalog.getBlockItems` | `block` | пакеты блока |
| Замены вкладок | `catalog.replaceBlocks` | `replacements { new_next_from, replacements[{ from_block_ids, to_blocks }] }` | пакеты новых блоков |

Пакеты, встреченные в слепке: `audios`, `playlists`, `recommended_playlists`, `links`, `audio_books`, `podcasts`, `podcast_episodes`, `radio_stations`, `audio_stream_mixes`, `audio_content_cards`, `catalog_banners`, `artists`, `artist_videos`, `concerts`, `market_items`, `placeholders`, `texts`, `suggestions`, `groups`, `profiles`, `albums` (всегда пустой). Пакеты, известные приложению, но не присланные ни разу: `curators`, `music_owners`, `videos`, `longreads`, `audio_books_persons`, `podcast_slider_items`, `audio_followings_update_info`.

---

## 2. Модель раздела каталога (`Section`)

```json
{
  "id": "PUldVA8FR0Rz...",
  "title": "Главная",
  "url": "https://vk.ru/audios720198974?section=general",
  "next_from": "...",
  "icon": "note_music_sa_28",
  "style": { "no_top_separator": true, "navbar_overlap": true },
  "breadcrumbs": [ ... ],
  "ad_banner": { ... },
  "blocks": [ ... ]
}
```

| Поле | Тип | Описание |
|---|---|---|
| `id` | string | Opaque-идентификатор секции |
| `title` | string | Заголовок |
| `url` | string | Каноническая ссылка страницы (есть не у всех: у 492 из 522 секций слепка) |
| `icon` | string | Имя иконки навигации |
| `style` | object | Флаги оформления страницы |
| `blocks` | array | Блоки в порядке отрисовки VK |
| `next_from` | string | Курсор следующей страницы секции |
| `breadcrumbs` | array | Хлебные крошки (частые у вложенных страниц) |
| `ad_banner` | object | Рекламный баннер страницы |
| `listen_events` | array | События статистики уровня секции |

Поле `actions` приложением поддерживается, но в слепке у секций не встречалось. Пустая секция (`blocks` отсутствует) — валидный ответ для подборок без контента.

---

## 3. Модель контентного блока (`Block`)

Блок — скелет отрисовки: раскладка, кнопки и ссылки на сущности из пакетов конверта.

```json
{
  "id": "PUlQVA8GR0R3...",
  "data_type": "music_audios",
  "layout": { "name": "list", "owner_id": 720198974 },
  "audios_ids": [ "720198974_456239065" ],
  "next_from": "..."
}
```

### 3.1. Полный набор полей блока

| Поле | Тип | Описание |
|---|---|---|
| `id` | string | Opaque-идентификатор блока (эфемерен — см. VK-API.md) |
| `data_type` | string | Тип данных блока, см. §3.2 |
| `layout` | object | Раскладка отрисовки, см. §4 |
| `title` / `subtitle` | string | Заголовок и подзаголовок блока (часто дублируют `layout.title`) |
| `url` | string | Ссылка развернутой страницы блока (`section=…&block=…`); есть у 832 блоков слепка |
| `next_from` | string | Курсор докрутки через `catalog.getBlockItems` |
| `actions` | array | Кнопки блока, см. §5 |
| `meta` | object | Служебные метаданные: `show_all_info` (объект `{section_id, title}` — адрес страницы «Показать всё»), `context` (например `kids_section`), `anchor` (якорь групповой кнопки, например `genres`) |
| `listen_events` | array | Имена событий статистики для элементов блока, см. §9 |
| `artist_info` | string | Информация артиста — JSON, сериализованный **строкой** внутри JSON (структура §8.15) |
| `items_count` | int | Общее число элементов блока (у докручиваемых) |
| `badge` | object | Бейдж: `{ "text": "6983", "type": "transparent" }` — в основном у блоков `none`, встречается и у `action` |
| `*_ids` | array | Ссылки на сущности блока, порядок — порядок отрисовки, см. §3.2 |

Ссылочные поля `*_ids` VK присылает не у всех блоков ряда: блок `audio_books` на странице секции всегда без `audio_book_ids` (ленивая карусель — см. §6.4), а `catalog_banner_ids`, `radio_stations_ids` и части концертов приходят пустыми у раскрываемых блоков.

### 3.2. Таксономия `data_type`

28 видов блоков известны приложению (их адаптеры подтверждают и ссылочные поля) плюс `market_items`, которого в таксономии приложения нет («—» = не прислан слепком):

| `data_type` | Ссылочные поля | В слепке |
|---|---|---|
| `music_audios` | `audios_ids` | ✓ (230 блоков) |
| `music_playlists` | `playlists_ids`, опц. `catalog_recom_playlist_relations` | ✓ (262) |
| `music_recommended_playlists` | `audios_ids` + `playlists_ids` | ✓ (6) |
| `music_owners` | `music_owners_ids` | — |
| `action` | — (только `actions`) | ✓ (55) |
| `none` | — (+ `badge`) | ✓ (409) |
| `empty` | — | ✓ (9) |
| `artist` | `artists_ids` + `artist_info` | ✓ (38) |
| `artist_videos` | `artist_videos_ids` | ✓ (23) |
| `audio_books` | `audio_book_ids` | ✓ (195) |
| `audio_books_persons` | `audio_books_person_ids` | — |
| `audio_content_cards` | `audio_content_card_ids` | ✓ (4) |
| `audio_followings_update_info` | `audio_followings_update_info_ids` | — |
| `audio_stream_mixes` | `audio_stream_mixes_ids` | ✓ (6) |
| `catalog_banners` | `catalog_banner_ids` | ✓ (12) |
| `concerts` | `concerts_ids` | ✓ (6) |
| `curator` | `curators_ids` | — |
| `groups` | `group_ids` | — |
| `links` | `links_ids` | ✓ (197) |
| `longreads` | `longreads_ids` | — |
| `market_items` | `market_item_ids` | ✓ (15) — тип страниц артистов (мерч VK Market), приложению неизвестен |
| `placeholder` | `placeholder_ids` | ✓ (8) |
| `podcast_episodes` | `podcast_episodes_ids` | ✓ (8) |
| `podcast_slider_items` | `podcast_slider_items_ids` | — |
| `podcasts` | `podcast_items_ids` | ✓ (49) |
| `radiostations` | `radio_stations_ids` | ✓ (10) |
| `search_suggestions` | `suggestions_ids` | ✓ (4) |
| `texts` | `text_ids` | ✓ (2) |
| `videos` | `videos_ids` | — |

Особые строки:
- `action` — блок кнопок (жанры, «показать всё», вкладки); сущностей у него нет;
- `none` — заголовки и разделители (`header_extended`, `separator`); рекордсмен по числу бейджей (`badge` присылается и у блоков `action`);
- `empty` — явная заглушка пустого состояния;
- `music_recommended_playlists` — единственный тип с двумя ссылочными списками (`audios_ids` + `playlists_ids`).

---

## 4. Раскладка блока (`layout`)

```json
{
  "name": "list",
  "owner_id": 720198974,
  "title": "Мои треки",
  "style": "default"
}
```

| Поле | Тип | Встречаемость в слепке | Описание |
|---|---|---|---|
| `name` | string | всегда (у `empty`-блоков — пустая строка `""`) | Имя раскладки |
| `owner_id` | int | 615 блоков | Владелец контекста раскладки |
| `style` | string | 322 | Стиль внутри раскладки |
| `title` | string | 238 | Заголовок ряда |
| `size` | any | 6 | Параметр размера |
| `subtitle` | string | 4 | Подзаголовок |
| `infinite_repeat` | bool | 8 | Зацикленная карусель |
| `top_title` | object | 2 | Плашка над блоком: `{ "icon": "url", "text": "ТОЛЬКО В VK МУЗЫКЕ" }` |

### 4.1. Таксономия раскладок

В слепке присланы 39 именованных раскладок (плюс пустое имя у `empty`):

`artist_header`, `artist_merch_slider`, `audio_content_card_extended_slider`, `audio_stream_mix`, `audio_stream_mix_interactive`, `banner`, `biography_layout`, `categories_grid`, `categories_list`, `crop_slider`, `double_list`, `double_stacked_list`, `dynamic_grid`, `featured_list`, `header_compact`, `header_extended`, `header_large`, `horizontal_buttons`, `kids_catalog`, `kids_collection`, `large_slider`, `list`, `music_chart_large_slider`, `music_chart_list`, `music_chart_triple_stacked_slider`, `placeholder_big`, `playable_item_in_progress`, `podcast_banners_slider`, `podcast_category_genre_buttons`, `promo_banners_slider`, `recomms_slider`, `separator`, `slider`, `small_banner_offer`, `small_list`, `subsection_tabs`, `text`, `triple_stacked_slider`.

Из них приложению неизвестны четыре (рендерятся через запасной путь): `dynamic_grid`, `kids_catalog`, `kids_collection`, `small_banner_offer`.

Раскладки, известные приложению, но не присланные слепком: `artists_slider`, `compact_list`, `entity_double_grid`, `header`, `in_block_separator`, `large_list`, `link_snippet`, `listened_list`, `music_exclusive_slider`, `music_newsfeed_title`, `owner_cell`, `placeholder`, `placeholder_small`, `podcasts_favorites`, `snippets_banner`.

Связки `data_type × layout`, реально встреченные в слепке, — в отчёте покрытия `raw-report.md` (матрица).

---

## 5. Кнопки блоков (`actions`)

Каждый элемент `actions[]` — объект с вложенным действием `action` и полями полезной нагрузки:

```json
{
  "action": { "type": "open_section", "style": "default" },
  "section_id": "PUk...",
  "title": "Показать всё"
}
```

### 5.1. Типы действий

Присланные слепком: `open_section` (открыть секцию по `section_id`), `open_url` (открыть страницу по `url`; так попадаются скрытые разделы вроде `in_progress`), `play_vk_mix` (запустить микс `mix_id` с опциями `mix_options`), `play_audios_from_block` / `play_shuffled_audios_from_block` (играть треки блока `block_id`), `toggle_artist_subscription` (подписка на артиста `artist_id`), `podcasts_subsection_tabs` (кнопка-контейнер вкладок `options[]`).

Встречается в живой выдаче поиска, но не в слепке: `switch_section` — переход на секцию-обёртку (`section_id` задан, `url` — заглушка `https://vk.ru/`). Обёртка содержит те же группы, что и выдача, поэтому переход через неё добавляет лишний экран; см. §6.1 о приоритете `show_all_info`.

Дополнительно известны приложению: `create_playlist`, `edit_items`, `enter_edit_mode`, `reorder_items`, `select_sorting`, `playlists_lists`, `owner_button`, `music_follow_owner`, `toggle_curator_subscription`, `share`, `synth_clear_search_history`, `synth_custom_action`.

**Тип действия лежит во вложенном `action.type`**, на верхнем уровне элемента `actions[]` его нет — там только полезная нагрузка (`section_id`, `title`, …). Чтение `type` с верхнего уровня даёт `null` для всех кнопок.

### 5.2. Поля кнопок

| Поле | Описание |
|---|---|
| `section_id` | Opaque-ID целевой секции (`open_section`) |
| `block_id` | Блок-источник треков (`play_*_from_block`) |
| `mix_id` / `mix_options` | Микс и его опции (`play_vk_mix`) |
| `artist_id` / `entity_id` / `owner_id` | Цель подписки или действия |
| `title` / `description` / `text` | Тексты кнопки |
| `icon` / `images` / `foreground_images` | Графика кнопки |
| `options` | Вкладки подраздела: `{ "replacement_id": "#<section_id>/#<subsection_id>", "text": "Подкасты", "selected": 1 }`; выбранная вкладка помечается `selected: 1` и запроса не требует — её блоки уже на странице |
| `ref_data_type` / `ref_layout_name` / `ref_items_count` | Прототип содержимого кнопки (тип, раскладка и число элементов в целевой секции) — приложение рендерит кнопку миниатюрой будущей страницы |
| `click_event_type` | Имя события статистики клика |
| `id` | Идентификатор кнопки |
| `is_following` | Состояние подписки (по приложению) |

---

## 6. Навигационные механизмы каталога

### 6.1. «Показать всё» (`meta.show_all_info`)

У разворачиваемых блоков `meta.show_all_info = { "section_id": "...", "title": "..." }` — адрес собственной страницы блока (263 блока слепка). Страница открывается обычным `catalog.getSection` по `section_id`. Поле `show_all_info` также может отсутствовать или принимать нестабильные значения — хранится сырым.

`section_id` внутри `show_all_info` бывает двух смыслов, и различать их обязательно:

- **указывает на другую секцию** (25 блоков) — блок показан превью, переход разворачивает его в полный список;
- **указывает на секцию, которой блок принадлежит** (122 блока, например `0232`, `0238`–`0242`) — блок уже и есть полный список. Такой переход ведёт сам в себя, и предлагать его нельзя.

Счёт по блокам секций, где сравнение возможно (147 из 263: остальные приходят одиночными ответами `block`, и сопоставлять их не с чем).

Отличить превью от полного списка по числу элементов нельзя: `music_audios/list` с `show_all_info` встречается с 3–100 треками в обоих смыслах.

Когда у блока есть и `show_all_info`, и собственные кнопки, **приоритет у `show_all_info`**: он ведёт прямо к полному списку, тогда как соседний `switch_section` (§5.1) — на секцию-обёртку, то есть на шаг в сторону.

### 6.2. Вкладки подразделов (`catalog.replaceBlocks`)

Блок с раскладкой `subsection_tabs` содержит кнопку `podcasts_subsection_tabs` со списком `options[]`. Выбранный вариант (`selected: 1`) соответствует текущей странице. Запрос к очередной вкладке — `catalog.replaceBlocks(replacement_ids="#<section_id>/#<subsection_id>")`; ответ: `replacements { new_next_from, replacements[{ from_block_ids, to_blocks }] }` + пакеты новых блоков. Клиент заменяет блоки с `from_block_ids` на `to_blocks`, сохраняя порядок.

### 6.3. Пагинация

Два уровня курсоров, оба opaque-строки:
- `section.next_from` → `catalog.getSection(section_id, start_from=<курсор>)` — следующая страница блоков;
- `block.next_from` → `catalog.getBlockItems(block_id, start_from=<курсор>)` — следующая порция элементов блока.

Продолжение есть, пока соответствующий `next_from` присутствует.

### 6.4. Ленивые карусели аудиокниг

Блоки `audio_books` на страницах секций всегда приходят без `audio_book_ids` — их карусели наполняются только через `catalog.getBlockItems`. То же правило действует на артист-страницах для `market_items` и `artist_videos` (свои `*_ids` присутствуют, но первичная карусель докручивается блочным методом).

### 6.5. Адреса-псевдонимы

Одна страница достижима несколькими адресами: домены `vk.com`/`vk.ru`, формы `audios<UID>?section=X` и `audio?section=X`, секция по `section_id` и по `url`. Дедуплицировать такие адреса специально не нужно, но и считать их разными страницами не следует.

---

## 7. Пакеты сущностей и форматы идентификаторов

Ссылочные списки блоков содержат идентификаторы, а сами объекты — корневые пакеты конверта. Резолвер связывает их строго в порядке ссылок блока.

Форматы идентификаторов:
- **Композитные `owner_id_id`** — аудио (`audios_ids`), плейлисты (`playlists_ids`), мерч (`market_item_ids`). Те же сущности в пакете имеют числовые `id` + `owner_id`, поэтому резолвер индексирует обе формы (`id` и `{owner_id}_{id}`);
- **Числовые или объектные** — радиостанции, подкасты, контент-карты и т.п.;
- **Opaque-строки** — `links_ids`, `suggestions_ids`: шестнадцатеричные токены без структуры; совпадают со строковым `id` сущности;
- **Составные коды** — `audio_book_ids` и `podcast_items_ids` ссылаются на сущности, у которых нет `owner_id` в музыкальном смысле (книги, подкасты).

Ссылки на сущности других страниц не разрешаются внутри своего конверта — это норма: например, все `concerts_ids` блоков указывают на концерты, которые лежат только в конвертах артист-страниц.

---

## 8. Сущности каталога

Все объекты пакетов из конверта §1: состав полей, вариативность, связи с блоками. Типовой JSON каждой сущности — в [Приложении A](#приложение-a-типовые-json-объекты).

### 8.1. Аудиозапись (`Audio`, пакет `audios`)

Полный набор полей по слепку:

| Поле | Описание |
|---|---|
| `id`, `owner_id` | Идентификаторы; `owner_id < 0` — сообщество |
| `artist`, `title`, `subtitle`, `performer` | Строки исполнителя и названия |
| `duration` | Длительность, сек |
| `url` | Прямая временная ссылка на поток (`.m3u8`/`.mp3`, привязана к IP). У ограниченных треков приходит **пустой строкой `""`** (поле присутствует) — трактуется как отсутствие ссылки |
| `access_key` | Ключ доступа для чужих/приватных треков |
| `content_restricted` | Код ограничения доступа (`1`, `2`) |
| `track_code` | Аналитический код трека |
| `release_audio_id` | Оригинальный релиз `owner_id_id` |
| `album_id`, `album` | Альбом релиза (id и вложенный объект с `thumb`) |
| `main_artists`, `featured_artists` | Массивы исполнителей `{ id, name, domain }`. `id` подходит для `catalog.getAudioArtist`. Есть у ~98% треков во всех методах, кроме `audio.getPopular` и `catalog.replaceBlocks`, — у пользовательских загрузок отсутствуют. Склейка имён (`", "` между основными, `" feat. "` перед приглашёнными) совпадает со строкой `artist` в 99.6% случаев: остальное — псевдонимы, другой регистр и продублированные записи, поэтому подменять `artist` собранной строкой нельзя |
| `thumb` | Обложка: `photo_34…photo_1200` + `sizes[]` (см. §10) |
| `main_color` | HEX-цвет обложки |
| `date`, `genre_id` | Время добавления, жанр |
| `has_lyrics`, `is_licensed`, `is_hq`, `is_explicit`, `is_focus_track` | Флаги трека |
| `no_search`, `like`, `dislike` | Скрыт из поиска / лайк / дизлайк текущего пользователя |
| `audio_chart_info` | Позиция и динамика в чарте (у чарт-блоков) |
| `legal_notices_type`, `flags_context` | Юридические и контекстные пометки |
| `short_videos_allowed`, `stories_allowed`, `stories_cover_allowed` | Разрешения использования |
| `ads` | Рекламная разметка `{ content_id, duration, account_age_type, puid1, puid22 }` |

### 8.2. Плейлист и альбом (`Playlist`, пакеты `playlists`, `albums`)

Объекты пакета `playlists` по слепку:

| Поле | Описание |
|---|---|
| `id` (< 0 у автоподборок), `owner_id`, `access_key` | Идентификаторы |
| `title`, `description`, `subtitle`, `subtitle_badge` | Тексты |
| `count`, `plays`, `followers` | Счётчики |
| `photo`, `thumbs`, `main_color` | Обложки и цвет |
| `genres` | Жанры подборки |
| `year` | Год (у релизов) |
| `type` | Вид (`ugc` и др.) |
| `is_explicit`, `is_following` | Флаги |
| `play_button` | Кнопка воспроизведения с трек-кодом |
| `permissions` | Права: `{ play, share, edit, delete, follow, boom_download, save_as_copy }` |
| `meta` | Мета: `view: "compact"` и др. |
| `restriction`, `no_discover`, `original` | Ограничения и видимость |
| `audio_chart_info` | Динамика чарта (у чарт-альбомов) |
| `main_artists`, `featured_artists`, `album` | Артисты и исходный альбом |
| `create_time`, `update_time` | Unix-время |

Пакет `albums` в слепке всегда пуст — VK резервирует его, но объектов не присылает.

#### «Собрано алгоритмами»

В проверенном слепке это не самостоятельная секция, а группа блоков на первой
странице корневой секции **«Главная»** (`section=general`). Полный родительский
конверт получается через `catalog.getSection` по opaque `id` секции «Главная».
Содержательный блок имеет:

- `title: "Собрано алгоритмами"`;
- `data_type: "music_playlists"`;
- `layout.name: "recomms_slider"`;
- `playlists_ids` вида `<user_id>_<negative_playlist_id>`.

У блока нет собственного `url`, `meta.show_all_info.section_id`, `next_from` и
`items_count`. `catalog.getBlockItems(block_id)` повторно отдаёт одиночный
block-конверт и тот же пакет `playlists`; докрутки в этом слепке нет. Соседний
`action` ведёт только на настройку рекомендаций
`audio?popup=recoms_onboarding&scenario=CA4`, а не на отдельную секцию.

В первом слепке пакет содержал шесть объектов `type: "generated"` с ID
`-23…-28`; в свежем `raw/generated-only` — семь: `-23…-29`. В обоих ответах
каталога отсутствует `-21` («Для вас»), хотя в предоставленном отдельном слепке
плиток было восемь (`-21`, `-23…-29`). Поэтому число плиток, конкретный диапазон
ID, порядок и `subtitle_badge` нельзя считать частью контракта. Структурный
признак — одновременно `type == "generated"` и `id < 0`; заголовок/раскладка
нужны для поиска блока, но не для классификации объекта.

Свежий прогон также показывает ленивое обновление ежедневных подборок. В
каталоге `-25…-29` имели `count=50/50/50/50/48`, `subtitle_badge=true` и старые
`update_time`. Сразу после `audio.getPlaylistById` те же ID вернули соответственно
`count=48/37/38/33/50`, `subtitle_badge=false` и новые последовательные
`update_time`. Значит, открытие generated-плейлиста может материализовать или
пересобрать его; объект плитки нельзя считать финальным снимком состава. При
этом `access_key` у `-23…-28` совпал между двумя репозиторными слепками.

Web-каталог (`catalog.getAudio(url=https://vk.ru/audios<UID>, need_blocks=1,
owner_id=<UID>)` внутри `batch.call`) отдаёт все восемь плиток, включая `-21`,
и чистую каталожную обложку «Для вас»: `photo.id=457239155`, `792×960`,
квадратные варианты с `crop=0,0,792,792`. Прямой
`audio.getPlaylistById(-21)` возвращает другую detail-обложку:
`photo.id=457239156`, `594×594`, с текстом, уже встроенным в JPEG. Это две
серверные photo-сущности; удалить текст изменением CDN query-параметров нельзя.

Web-пакет содержит 32 объекта `type=generated`: кроме восьми алгоритмических
плиток там находятся жанры и настроения. Принадлежность к «Собрано
алгоритмами» определяется пересечением с `playlists_ids` блока
`music_playlists/recomms_slider`, а не только `type=generated, id<0`.

Это обычный пакет `playlists` блока `music_playlists`, а не агрегатный пакет
`recommended_playlists` блока `music_recommended_playlists` (§8.3).

### 8.3. Рекомендованный плейлист (`recommended_playlists`)

Объект-агрегат «слушайте друг друга»: `{ id, owner_id, audios, cover, photo, color, percentage, percentage_title }` — доля совпадения вкуса и составной плейлист от нескольких владельцев.

### 8.4. Аудиокнига (`AudioBook`, пакет `audio_books`)

| Поле | Описание |
|---|---|
| `id`, `code`, `track_code` | Идентификаторы книги |
| `title`, `annotation` | Название и аннотация |
| `publisher`, `narrators`, `authors`, `translators`, `genres`, `main_genre` | Издатель, читцы, авторы, переводчики, жанры |
| `duration`, `file_size` | Длительность и размер файла |
| `cover` | Обложка |
| `access_status` | Доступ: `paid` (2426 в слепке), `free` (319), `started` (5) |
| `chapters` | Главы `{ duration, file_size, file: { url } }` — только у начатых/купленных книг (91 в слепке) |
| `progress_percentage` | Прогресс прослушивания |
| `minimum_age`, `is_explicit` | Возрастные ограничения |
| `has_illegal_mentions`, `illegal_mentions_text` | Отметки об упоминаниях (иноагенты и т.п.) |
| `in_favorites` | В избранном |
| `release_date`, `updated_at`, `copyright` | Даты и правообладатель |
| `restriction`, `flags_context` | Ограничения |

Персоны книг (`audio_books_persons`, по приложению): `{ id, name, photo, description, roles[] }` с ролями `AudioBookPersonRole { id }` — автор, читатель, переводчик.

### 8.5. Подкаст (`Podcast`, пакет `podcasts`)

Карточка подкаста: `{ id, owner_id, playlist_id, podcast_title, subtitle, thumbs, can_subscribe, is_subscribed, permissions, track_code }`. Связанный плейлист эпизодов — `playlist_id`.

### 8.6. Эпизод подкаста (`podcast_episodes`)

Полноценная воспроизводимая аудиозапись: `{ id, owner_id, artist, title, duration, url, file_size, date, is_explicit, is_focus_track, is_licensed, no_search, track_code, podcast_info }`. `url` ведёт на поток эпизода и присутствует в 8 из 8 эпизодов слепка (`playable_item_in_progress` в «Книги и шоу» и вкладки «Подкасты»/«Аудиокниги»).

### 8.7. Радиостанция (`radio_stations`)

`{ id, name, logo_url, logo_png_url, stream_url, background_color, is_enabled, is_followed }`. Поток — `stream_url`.

### 8.8. Персональный микс (`audio_stream_mixes`)

`{ id, titles, stream_mix, description, background_animation_url, is_tunable }`. Порция треков — через `audio.getStreamMixAudios(mix_id)`; настройки настроения — `audio.getStreamMixSettings(mix_id)`. Раскладки — `audio_stream_mix` и `audio_stream_mix_interactive`.

### 8.9. Контент-карта (`audio_content_cards`)

Редакционная карточка-витрина: `{ entity_id, entity_owner_id, entity_type, editor_tag, editor_annotation, editor_background_image, editor_gradient_image }`. Ссылается на сущность `entity_type` (подкаст, плейлист) с фирменным оформлением.

### 8.10. Промо-баннер (`catalog_banners`)

```json
{
  "id": "...",
  "title": "...",
  "text": "...",
  "image_mode": "cover",
  "images": [ { "url": "https://...", "width": 1200, "height": 300 } ],
  "buttons": [ ... ],
  "click_action": { ... },
  "track_code": "..."
}
```

### 8.11. Плитка-ссылка (`links`)

`{ id, title, subtitle, url, image, images, image_style, background, animation_url, analytic_name, meta }`. Одиночная картинка `image` и массив `images` встречаются вместе. Ссылки ведут на внутренние секции каталога, страницы кураторов и пользователей.

### 8.12. Подсказка поиска (`suggestions`)

`{ id, title, subtitle, context }`. Поле `context` — токен для перехода к выдаче через `catalog.getAudioSearch(context=...)`, совпадает с параметром `requested_section_id` приложения.

### 8.13. Заглушка (`placeholders`) и текст (`texts`)

- `placeholders`: `{ id, title, text, icons[] }` — пустое состояние страницы (например, детского «Радио»);
- `texts`: `{ id, text, collapsed_lines }` — текстовый блок («Кураторы»), `collapsed_lines` — число строк в свёрнутом виде.

### 8.14. Концерт (`concerts`)

```json
{
  "concert_data": {
    "id": "uuid", "title": "...", "place_title": "...",
    "age_category": "12+", "min_price": 2500,
    "start_datetime": "2026-08-13T21:00:00+03:00",
    "page_url": "https://..."
  },
  "purchase_action": { "action": { "type": "open_url", "url": "..." }, "title": "Купить билет" },
  "track_code": "..."
}
```

### 8.15. Артист (`artists`) и `artist_info`

Размер `photo` — снимок в пропорциях 4:3 (обычно `375x280`, `750x560`, `1125x840`, `1500x1120`), а не квадратный аватар; у части артистов приходит квадрат `143x143`, изредка `1440x720`. Широкой обложки страницы (4:1, как в веб-версии) API не отдаёт — под такую шапку снимок кадрируется на клиенте. При `is_album_cover: true` снимок является обложкой релиза.

Поле `photos` (в `catalog.getAudio`, `catalog.getSection`, `getBlockItems`) — не альтернатива `photo`: это список `{ type: "crop" | "default" | "mobile", photo: [...] }`, где у вложенных элементов приходят только `id`, а `url` пустой и `width`/`height` равны `0`.

```json
{
  "id": "5675683525501667231",
  "name": "ALEKS ATAMAN",
  "domain": "5675683525501667231",
  "is_followed": false,
  "can_follow": true,
  "bio": "...",
  "is_album_cover": true,
  "photo": [ { "url": "https://...", "width": 300, "height": 300 } ]
}
```

Блок `artist` дополнительно несёт поле `artist_info` — JSON, сериализованный **строкой** внутри основного JSON: `{ "chips": [ { "action": { "type": "play_vk_mix", "style": "default" }, "title": "Микс по артисту", "icon": "music_note_wave_outline_20", "mix_id": "artist_mix", "entity_id": "...", "track_code": "..." } ] }`. Чипы шапки артиста также содержат `block_id`, `is_foreign_agent`, `play_track_code`, `subscription_track_code`, `play_action_ref` (по приложению).

### 8.16. Товар мерча (`market_items`)

Полный объект VK Market: `{ id, owner_id, title, description, price, thumb, thumb_photo, market_url, availability, item_type, category, cart_quantity, csrf_hashes, has_group_access, is_owner, is_adult, is_hardblocked }`. Встречается на артист-страницах («Мерч», раскладки `artist_merch_slider` и `double_stacked_list`).

### 8.17. Видео артиста (`artist_videos`)

Стандартный видеообъект VK: `id`, `owner_id`, `title`, `description`, `duration`, `photo`/`image`/`first_frame`, `player`, `direct_url`, `files`, `views`, `local_views`, `likes`, `comments`, `reposts`, `can_like`, `can_comment` и др. (полный набор — в слепке), плюс `main_artists`, `is_explicit`, `release_date`, `track_code`.

---

## 9. Метаданные блоков и события статистики

### 9.1. `listen_events`

Перечень действий, которые VK ожидает отправить через `stats.trackEvents` для элементов блока. По слепку: `music_audios_add`, `music_audios_remove`, `links_add`, `links_remove`, `links_subscribe`, `links_unsubscribe`, `audio_books_subscribe`, `audio_books_unsubscribe`, `podcasts_subscribe`, `podcasts_unsubscribe`, `podcast_episodes_mark_as_listened`. Они определяют набор контекстных действий блока в интерфейсе.

### 9.2. `badge`

Бейдж блока: `{ "text": "6983", "type": "transparent" }` — например, счётчик треков у заголовка «Мои треки». Подаётся преимущественно у `none`, в слепке прислан и у двух блоков `action`.

### 9.3. `meta`

- `show_all_info` — см. §6.1;
- `context` — контекст блока (`kids_section` у баннеров «Детям»);
- `anchor` — якорь группового действия (`genres` у блока жанров).

---

## 10. Размеры изображений и сетка обложек

VK Музыка возвращает обложки треков, альбомов и плейлистов в нескольких форматах.

### 10.1. Именованные пресеты `photo_NNN` (квадратные)

В объекте `thumb` или `photo` присутствуют поля с фиксированным квадратным разрешением: `photo_34` (34×34), `photo_68` (68×68), `photo_135` (135×135), `photo_270` (270×270), `photo_300` (300×300), `photo_600` (600×600), `photo_1200` (1200×1200).

### 10.2. Универсальный массив `sizes[]`

```json
{
  "width": 1184,
  "height": 1184,
  "sizes": [
    { "type": "x", "width": 300, "height": 300, "src": "https://..." }
  ]
}
```

> Буквенные типы (`a`…`w`) не фиксированы по разрешению в разных контекстах. При выборе изображения ориентироваться исключительно на числовые `width` и `height`.

### 10.3. Баннеры и плитки ссылок

Прямоугольные баннеры (`catalog_banners.images`) и ссылки (`links.image`): баннеры — `600×150`, `1200×300`, `1800×450`, `2400×600` (4:1, `image_mode: "cover"`); плитки ссылок — `594×594` (квадрат).

---

## 11. Некаталожные ответы

### 11.1. Тексты песен (`audio.getLyrics`)

```json
{
  "credits": "Автор слов: ...",
  "md5": "5afcff0d667af65c37c797fcbf26f5f8",
  "lyrics": {
    "language": "ru",
    "text": [ "Строка 1", "Строка 2", "" ],
    "timestamps": [
      { "begin": 1450, "end": 5950, "line": "Строка 1" }
    ]
  }
}
```

В одном ответе есть либо синхронизированные `timestamps`, либо простой `text`. Поле `md5` — контрольная сумма текста. Если текста нет — ошибка `104 (Not found)`, трактуется как пустое состояние.

### 11.2. Пользователь и профиль (`users.get`)

```json
{
  "id": 720198974,
  "first_name": "Имя",
  "last_name": "Фамилия",
  "screen_name": "screen_name",
  "photo_base": "https://...",
  "photo_100": "https://...",
  "photo_200": "https://...",
  "verified": 1,
  "counters": { "audios": 1081, "albums": 5, "clips_followers": 321, ... }
}
```

### 11.3. Плейлист целиком (`audio.getPlaylistById`, `execute.getPlaylist`)

`audio.getPlaylistById` возвращает полный объект плейлиста (§8.2) с `genres`,
`is_following`, `play_button`, но в проверенном ответе на generated-плейлист не
возвращает его треки даже при `audio_count=20`.

Страницы треков отдаёт `execute.getPlaylist`: полный массив страницы находится
в верхнеуровневом `audios` (не в `items`). При `need_playlist=1` ответ также
содержит объект `playlist`; его `playlist.audios` в слепке был лишь коротким
preview (3 трека при 20 верхнеуровневых), поэтому использовать его для
пагинации нельзя. Следующие страницы запрашиваются через `audio_offset` и
`audio_count`.

### 11.4. Настройки микса (`audio.getStreamMixSettings`)

```json
{
  "settings": {
    "title": "VK Микс",
    "mix_categories": [
      {
        "id": "vibes",
        "options": [
          { "id": "happy", "title": "Радостно", "selected": false }
        ]
      }
    ]
  }
}
```

Для части `mix_id` VK возвращает пустой массив `[]` — форма ответа нестабильна, принимаются обе.

### 11.5. Ограничение доступа (`audio.getRestrictionPopup`)

`{ "title": "...", "icons": [ { "url", "width", "height" } ] }` — всплывающее окно объяснения недоступности трека.

### 11.6. События плеера (`stats.trackEvents`)

Отправляемый массив событий в параметре `events`. Имена событий — как в
мобильном/веб-клиенте: `music_start_playback` / `music_stop_playback`.
`uuid` — числовой (hash от UUID), `playback_started_at` — время начала
прослушивания, мс.
```json
[
  {
    "e": "music_start_playback",
    "audio_id": "720198974_456239065",
    "uuid": 1234567890,
    "reason": "auto",
    "start_time": 0,
    "playback_started_at": 1770744689000,
    "streaming_type": "online",
    "duration": 0,
    "repeat": "all",
    "state": "app",
    "source": "other"
  }
]
```
Ответ — целое число `1`.

### 11.7. Серверы загрузки

`audio.getUploadServer` и `photos.getAudioPlaylistCoverUploadServer`: `{ "upload_url": "https://pu.vk.ru/gu/photo/v2/upload?token=..." }`.

---

## 12. Сводная таблица методов и форм ответа

| Метод | Формат возвращаемых данных |
|---|---|
| `catalog.getAudio` | Конверт: `catalog.sections` без пакетов (корень, 6 разделов) либо одна секция с пакетами (по `url`) |
| `catalog.getSection` | Конверт: `section` + пакеты секции; пагинация `section.next_from` |
| `catalog.getBlockItems` | Конверт: `block` + пакеты блока; пагинация `block.next_from` |
| `catalog.replaceBlocks` | Конверт: `replacements` (`new_next_from`, `from_block_ids`, `to_blocks`) + пакеты |
| `catalog.getAudioSearch` | Пустой запрос — секция `search_suggestions`; с запросом — заглушка `default_section` |
| `catalog.getAudioArtist` | Заглушка `default_section` страницы исполнителя |
| `audio.get` | `{ "count": int, "items": [Audio], "groups": [...], "profiles": [...], "next_from": "..." }` |
| `audio.getById` | Массив композиций `[Audio]` |
| `audio.getCount` | Целое число |
| `audio.getPlaylists` | `{ "count": int, "items": [Playlist], "profiles": [...], "groups": [...] }` |
| `audio.getPlaylistById` | Полный объект плейлиста |
| `audio.getLyrics` | Объект текста песни либо ошибка `104` |
| `audio.getPopular` | Массив популярных композиций `[Audio]` |
| `audio.getRecommendations` | `{ "count": int, "items": [Audio] }` (+ поле `audios`) |
| `audio.search` | `{ "count": int, "items": [Audio] }` |
| `audio.getStreamMixSettings` | `{ "settings": {...} }` либо пустой массив `[]` |
| `audio.getStreamMixAudios` | Массив композиций микса `[Audio]` |
| `audio.getRestrictionPopup` | `{ "title": "...", "icons": [...] }` |
| `audio.getUploadServer` | `{ "upload_url": "https://..." }` |
| `photos.getAudioPlaylistCoverUploadServer` | `{ "upload_url": "https://..." }` |
| `stats.trackEvents` | Целое число `1` |
| `execute.getPlaylist` | `{ "audios": [Audio] }`, при `need_playlist=1` + `playlist`, `profiles`, `groups` |
| `users.get` | Массив профилей `[User]` с `counters` |

Методы, известные по коду приложения, но не покрытые слепком, — в разделе «Каталожные методы приложения» файла [`VK-API.md`](./VK-API.md).

---

## 13. Write-методы (меняют аккаунт)

Мутирующие методы изменяют состояние профиля. Ответ у большинства методов — целое число `1`. Исключения:

### 13.1. `audio.add`

```json
{
  "errors": [],
  "errors_count": 0,
  "items": [
    {
      "audio_raw_id": "720198974_456239065",
      "new_audio_id": 456239071,
      "new_owner_id": 720198974
    }
  ],
  "items_count": 1
}
```

> Для последующего удаления (`audio.delete`) или восстановления (`audio.restore`) только что добавленного трека клиент обязан использовать `new_audio_id`.

### 13.2. `audio.restore`

Возвращает не `1`, а полный объект восстановленной аудиозаписи (`Audio`), включая `url`, `access_key` и обложку.

### 13.3. `audio.createPlaylist`

Возвращает полный объект созданного плейлиста со статусом `"type": "ugc"`, сгенерированным `access_key` и правами редактирования/удаления.

---

## Приложение A. Типовые JSON-объекты

Канонические примеры сущностей, сокращённые реальные объекты эталонного слепка `raw/` (обрезанные участки отмечены `...`). Порядок полей в ответах VK совпадает с алфавитным.

### A.1. Аудиозапись (`audios`)

```json
{
  "id": 146851085,
  "owner_id": -2001851085,
  "artist": "MONOЛИЗА",
  "title": "...",
  "duration": 198,
  "url": "https://.../audios/.../index.m3u8",
  "access_key": "9d6b3b8b5f22c3cf26",
  "date": 1770744689,
  "is_licensed": true,
  "is_explicit": false,
  "is_focus_track": false,
  "has_lyrics": true,
  "short_videos_allowed": true,
  "stories_allowed": true,
  "stories_cover_allowed": true,
  "main_color": "#010101",
  "release_audio_id": "-2001851085_146851085",
  "main_artists": [
    { "id": "1865750207173903587", "name": "MONOЛИЗА", "domain": "1865750207173903587", "is_followed": false, "can_follow": false }
  ],
  "thumb": {
    "id": "457239045", "width": 1500, "height": 1500,
    "photo_34": "https://...", "photo_68": "https://...", "photo_135": "https://...",
    "photo_270": "https://...", "photo_300": "https://...", "photo_600": "https://...", "photo_1200": "https://..."
  },
  "album": {
    "id": 26707484, "owner_id": -2000707484, "title": "Мотыльки",
    "access_key": "ffea30efb0bac11701", "main_color": "#010101",
    "thumb": { "id": "457239045", "width": 1500, "height": 1500, "photo_300": "https://...", "...": "..." }
  },
  "ads": { "content_id": "-2001851085_146851085", "duration": "198", "account_age_type": "3", "puid1": "554", "puid22": "4" }
}
```

### A.2. Плейлист (`playlists`)

Автоматическая подборка каталога (обратите внимание: отрицательный `id`, `type: "generated"`):

```json
{
  "id": -24,
  "owner_id": 477581109,
  "title": "Открытия",
  "subtitle": "Новое для вас",
  "subtitle_badge": false,
  "description": "",
  "type": "generated",
  "count": 100,
  "plays": 0,
  "followers": 0,
  "access_key": "8acf04e94588578a39",
  "main_color": "#A038E5",
  "genres": [],
  "is_following": false,
  "create_time": 1707173354,
  "update_time": 1786054969,
  "meta": { "view": "compact" },
  "play_button": true,
  "photo": {
    "id": "457239162", "width": 792, "height": 960,
    "photo_34": "https://...", "photo_68": "https://...", "photo_135": "https://...",
    "photo_270": "https://...", "photo_300": "https://...", "photo_600": "https://...", "photo_1200": "https://..."
  },
  "permissions": {
    "play": true, "share": false, "edit": false,
    "delete": false, "follow": false,
    "boom_download": false, "save_as_copy": true
  }
}
```

### A.3. Рекомендованный плейлист (`recommended_playlists`)

```json
{
  "id": 250,
  "owner_id": 316928755,
  "audios": [ "316928755_456259533", "..." ],
  "cover": "https://...",
  "color": "#3681FF",
  "percentage": 0.98,
  "percentage_title": "совпадение с вашим вкусом",
  "photo": { "id": "457246443", "width": 736, "height": 1104, "photo_300": "https://...", "...": "..." }
}
```

### A.4. Аудиокнига (`audio_books`)

```json
{
  "id": 11247,
  "code": "9785353122753",
  "title": "Гвихоль. Красные чернила смерти",
  "annotation": "Новый дроп серий - каждую среду...",
  "access_status": "paid",
  "duration": 14284,
  "file_size": 0,
  "progress_percentage": 0,
  "minimum_age": 18,
  "is_explicit": false,
  "in_favorites": false,
  "has_illegal_mentions": false,
  "release_date": 1785272400,
  "copyright": "© ООО «РОСМЭН»,2026",
  "publisher": { "id": 10, "name": "Rosman" },
  "authors": [ { "id": 3170, "name": "Ангелина и Вероника Шэн", "photo": [] } ],
  "narrators": [ { "id": 5892, "name": "Полина Ртищева", "photo": [] } ],
  "genres": [ { "id": 5, "name": "Фантастика" } ],
  "main_genre": { "id": 5, "name": "Фантастика" },
  "cover": [ { "url": "https://...", "width": 68, "height": 68 }, "..." ],
  "chapters": []
}
```

`access_status`: `paid` / `free` / `started`. Массив `chapters` непустой только у начатых и купленных книг: `{ "duration": int, "file_size": int, "file": { "url": "https://..." } }`.

### A.5. Подкаст (`podcasts`)

```json
{
  "id": -100,
  "playlist_id": -100,
  "owner_id": -210456337,
  "podcast_title": "Чокнемся",
  "subtitle": "Поп-культура",
  "can_subscribe": true,
  "is_subscribed": false,
  "permissions": { "play": true },
  "thumbs": [
    { "width": 1400, "height": 1400, "sizes": [ { "type": "h", "src": "https://...", "width": 50, "height": 50 }, "..." ] }
  ],
  "track_code": ""
}
```

### A.6. Эпизод подкаста (`podcast_episodes`)

```json
{
  "id": 456239111,
  "owner_id": -93452690,
  "artist": "BANANAFOX",
  "title": "Алло, привет! Перед тем, как писать музыку",
  "duration": 846,
  "url": "https://psv4.vkuseraudio.ru/s/...",
  "file_size": 35536504,
  "date": 1565143334,
  "is_licensed": true,
  "is_explicit": false,
  "is_focus_track": false,
  "no_search": 1,
  "track_code": "915f005eMPm-X8hxtzZNvzmNfDOjY_...",
  "podcast_info": {
    "cover": { "sizes": [ { "type": "a", "url": "https://...", "width": 640, "height": 640 }, "..." ] },
    "description": "Это BANANAFOX и первый выпуск...",
    "is_favorite": false, "is_listened": false, "is_new": false,
    "plays": 248, "position": 0, "post": "-93452690_7791"
  }
}
```

### A.7. Радиостанция (`radio_stations`)

```json
{
  "id": 31,
  "name": "Радио Record - Россия",
  "stream_url": "https://hls-01-radiorecord.hostingradio.ru/...",
  "logo_url": "https://pp.vkuserphoto.ru/...",
  "logo_png_url": "https://pp.vkuserphoto.ru/...",
  "background_color": "#000000",
  "is_enabled": true,
  "is_followed": true
}
```

### A.8. Персональный микс (`audio_stream_mixes`)

```json
{
  "id": "common",
  "description": "Музыкальные рекомендации для вас",
  "is_tunable": true,
  "background_animation_url": "https://...",
  "stream_mix": { "id": "common", "title": "Слушать VK Микс" },
  "titles": { "common_state": "Слушать VK Микс", "play_state": "Играет VK Микс" }
}
```

### A.9. Контент-карта (`audio_content_cards`)

```json
{
  "entity_type": "podcasts",
  "entity_id": "-100",
  "entity_owner_id": "-210456337",
  "editor_tag": "Чокнемся",
  "editor_annotation": "Карты, деньги поп-культура: об...",
  "editor_background_image": [ { "url": "https://...", "width": 152, "height": 328 }, "..." ],
  "editor_gradient_image": [ { "url": "https://...", "width": 103, "height": 103 }, "..." ]
}
```

### A.10. Плитка-ссылка (`links`)

```json
{
  "id": "0b789a33b18176fd5f",
  "title": "Мои треки",
  "subtitle": "6983 всего",
  "url": "https://vk.ru/audio?catalog=my_audios",
  "analytic_name": "collection",
  "image_style": "triple_rotated_right",
  "image": [ { "url": "https://...", "width": 594, "height": 594 } ],
  "images": [ [ { "url": "https://...", "width": 1500, "height": 1500 } ], "..." ],
  "background": {
    "type": "gradient", "sub_type": "linear", "angle": 0.0,
    "colors": [ { "hex": "F65AF9", "alpha": 1.0 }, "..." ],
    "positions": [ 0.1 ]
  },
  "meta": { "content_type": "audio_playlists", "is_explicit": false, "additional_entities": [], "track_code": "5979936cy-..." }
}
```

Особенности: `images` — массив **массивов** вариантов картинки (у плиток-троек по одному на слой), `background` — градиент с остановками `colors`/`positions`.

### A.11. Подсказка поиска (`suggestions`)

```json
{
  "id": "f530b0496185594fb2",
  "title": "atl",
  "subtitle": "",
  "context": "PUkYA1BGEkR8SQgCWRZHRCkbHR9aWh..."
}
```

### A.12. Заглушка (`placeholders`) и текст (`texts`)

```json
{ "id": "PUlYTxcOSQQnBQcTRxZHRHRbS0wXVR...", "title": "Сейчас бесплатные", "text": "Добавляйте эти книги и слушайте их без подписки", "icons": [ { "url": "https://...", "width": 113, "height": 112 }, "..." ] }
```
```json
{ "id": "fddfd04110ba9792ca", "text": "Кураторы — это сообщества о музыке...", "collapsed_lines": 2 }
```

### A.13. Товар мерча (`market_items`)

```json
{
  "id": 12192039,
  "owner_id": -1097989,
  "title": "Футболка Oversize BLACK STAR",
  "description": "Футболка кроя Оверсайз, унисекс...",
  "market_url": "https://vk.ru/market/product/f...",
  "price": { "amount": "180000", "currency": { "id": 643, "name": "RUB", "title": "₽" }, "text": "1 800 ₽" },
  "thumb": "https://...",
  "thumb_photo": [ { "url": "https://...", "width": 400, "height": 400 }, "..." ],
  "availability": 0,
  "item_type": 0,
  "is_adult": false,
  "is_hardblocked": false,
  "is_owner": false,
  "has_group_access": true,
  "csrf_hashes": "fav=dedb73502bbc121100",
  "cart_quantity": 0,
  "category": { "id": 40015, "name": "Футболки и топы", "inner_type": "market_market_category_nested", "is_v2": true, "parent": { "id": 30000, "name": "Одежда", "...": "..." } }
}
```

---

## Приложение B. Сущности типов, известных только по коду приложения

Следующие семь пакетов приложение умеет разбирать, но слепку они не присланы ни разу. Ссылочные поля их блоков известны точно (§3.2); состав самих объектов — по моделям приложения, где он есть.

| Пакет | Блок (`data_type`) | Состав объекта |
|---|---|---|
| `curators` | `curator` | Карточка куратора: аналог `Profile`/`Group` с музыкальными полями |
| `music_owners` | `music_owners` | Владельцы музыки: профили/сообщества (состав — `Profile`/`Group`) |
| `videos` | `videos` | Стандартный видеообъект VK (как `artist_videos`, §8.17) |
| `longreads` | `longreads` | Лонгриды витрины подкастов |
| `audio_books_persons` | `audio_books_persons` | Персоны книг: `{ id, name, photo, description, roles[] }`, роль — `{ id }` |
| `podcast_slider_items` | `podcast_slider_items` | Элементы слайдера подкастов двух видов: эпизод и кнопка «случайный выпуск» |
| `audio_followings_update_info` | `audio_followings_update_info` | Счётчик обновлений подписок + список профилей |

Эти типы сохраняйте в парсере наряду с остальными: если VK начнёт их отдавать, конверт не должен дробиться.
