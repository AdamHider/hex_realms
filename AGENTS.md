# Hex Realms — заметки для агентов

Один файл: `hex-realms (3).html` — пошаговая стратегия на гексовой карте (русский UI).
Всё — HTML + CSS + один `<script>` (IIFE, `"use strict"`), без сборки и зависимостей.
Запуск: открыть файл в браузере или `python3 -m http.server 8000`.

## Структура скрипта (порядок разделов = будущие файлы)

В начале скрипта есть оглавление с номерами 1–11. Схема данных и логики —
в `HEX-REALMS-SCHEMA.md`.

1. `data/` — справочники: местность, ресурсы, цены, фракции, здания
2. `core/` — `EventBus`, `EVENTS`, `Entity`
3. `hex.js`, `entities/` — геометрия и сущности
4. `world/` — `Terrain`, `WorldMap`
5. `mapgen.js` — генератор карты
6. `paint/` — слои, `Sprite`, здания, сетка, города
7. `game/` — `Game`, `TurnManager`, `Relation`/`Relations`
8. `rules/` — `Economy`, `Construction`, `Combat`, `Movement`, `Actions`
9. `ai.js` — `AI`
10. `ui/` — `Camera`, `Interaction`, `PanelView`, `TurnScreenView`, `Interface`
11. `boot.js` — запуск, тема, настройки

При правках сохраняй это разбиение: новая сущность идёт в свой раздел.

## Опоры, на которых стоит код

- Таблицы правил и данных (раздел 1): `TERRAIN`, `RESOURCES`/`RES_KEYS`, `COSTS`,
  `RULES`, `LEVEL_NAMES`, `FACTIONS`, `REGION_KINDS`, `SPECIALIZATIONS`, `BUILDING_TYPES`.
- Сущности наследуются от `Entity`: `uid`, `type`, `update()`, `destroy()`, своя шина
  событий. `Hex`, `Unit`, `Building`, `MapObject`, `Faction`, `Region`, `Settlement`,
  `River`. Доменные методы: `unit.move/merge/upgrade/takeCasualties`,
  `building.upgrade`, `hex.place/unplace`, `faction.canAfford/pay/receive`.
- Юнит попадает на клетку и уходит с неё только через `hex.place()`/`hex.unplace()`
  (или `unit.move()`/`unit.destroy()`) — иначе `unit.hex` разъедется с `hex.unit`.
- Инстансы вместо глобальных объектов: `game.map` (`WorldMap`: `hexes`, `rivers`,
  `regions`, `settlements`, `terrain`), `game.factions`, `game.relations`,
  `game.turns`, `camera`, `interaction`, `Panel`, `TurnScreen`, `ui`.
- Запросы к карте — через её методы: `map.get`, `map.neighbors`, `map.around`,
  `map.crossable`, `map.ownedBy`, `map.terrain.passable/cost/label`.
- События: `game.on(EVENTS.log|gameOver|roundStart|capture, fn)`; `on()` возвращает
  функцию отписки. У сущностей события локальные (`move`, `upgrade`, `destroy`…).
- `TurnManager` не знает про DOM: показ хода идёт через `ui.presenter()`
  (`begin/faction/step/progress/round/repaint/end`).

## Проверка изменений (обязательно)

Картинка должна совпадать пиксель в пиксель. Стенд — `/tmp/harness`
(puppeteer-core + `/usr/bin/chromium`):

```bash
python3 /tmp/harness/mkcopy.py "hex-realms (3).html" 12345 /tmp/harness/n12345.html
node /tmp/harness/verify.js /tmp/harness/n12345.html > /tmp/harness/new-12345.json
```

`mkcopy.py` подменяет `newGame(Date.now() % 1000000)` на фиксированный сид —
без этого карта каждый раз новая и сравнение бессмысленно. `verify.js` проходит
16 шагов (старт, выбор, три хода ИИ, тема, сетка/регионы, зум) и пишет хеши
холста, панели, журнала и номер раунда. Базовая линия — `base-<сид>.json`
(снимается с исходного файла тем же стендом). Проверяй минимум сиды
`12345`, `777`, `2024`.

## Стиль

- Два пробела, одинарные кавычки, `const`/`let`, короткие стрелочные функции.
- Имена: сущности — существительные, методы — глаголы (`paint`, `build`, `cost`, `reach`).
- Не собирай длинные вычисления в одну строку: промежуточные величины — в именованные
  локальные переменные, с комментарием, если смысл не очевиден (шум, веса, отступы).
- Комментарии — по-русски и только про неочевидное: инварианты, трюки ради парити,
  магические числа из рисунка. Код не пересказывать.
