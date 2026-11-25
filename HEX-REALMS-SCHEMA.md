# Hex Realms — схема данных и логики

Одностраничное описание того, из чего собрана игра: сущности, их поля и связи,
кто чем владеет, как проходит ход и как части кода общаются между собой.
Порядок разделов совпадает с порядком разделов в `hex-realms (3).html`
(он же — порядок будущих файлов).

```
данные (справочники)  →  сущности  →  мир (карта)  →  партия  →  правила  →  интерфейс
      data/                entities/      world/         game/       rules/        ui/
```

## 1. Слои и направление зависимостей

| Слой | Что знает | Что не знает |
|---|---|---|
| `data/` | только числа, строки и предикаты справочников | ни о чём не знает, чистые данные |
| `core/` | `EventBus`, `Entity` | о конкретных сущностях |
| `entities/` | свои поля и свои события | о карте, партии, отрисовке |
| `world/` | клетки, реки, регионы, поселения, правила местности | о фракциях и правилах игры |
| `game/` | карту, фракции, отношения, ходы | о том, как это нарисовать |
| `rules/` | состояние партии и чистые расчёты | о DOM и canvas |
| `ui/` | состояние партии и отрисовку | не меняет правила, только вызывает их |
| `ai/` | состояние партии, правила и движение | о DOM |

Правило: слой видит только нижние. Обратная связь — через события и через
`presenter` (менеджер ходов не знает про DOM, интерфейс подписывается сам).

## 2. Сущности (`entities/`)

Все наследуются от `Entity`: `uid`, `type`, `dead`, `update()`, `destroy()`,
своя шина событий (`on/off/emit`).

| Класс | type | Ключевые поля | Методы | События |
|---|---|---|---|---|
| `Hex` | `hex` | `q,r`, `terrain`, `owner`, `capital`, `region`, `unit`, `building`, `object`, `settlement`, `level`, `spec`, `res`, `occ`, `pending` | `place(unit)`, `unplace(unit)`, `update()` | — |
| `Unit` | `unit` | `owner`, `strength`, `hasMoved`, `hex` | `move(hex)`, `merge(other)`, `upgrade()`, `takeCasualties(s)`, `update()` | `move`, `merge`, `upgrade`, `casualties`, `destroy` |
| `Building` | `building` | `kind` (`settlement`\|`field`), `level` | `upgrade()` | `upgrade`, `destroy` |
| `MapObject` | `object` | `kind` (`gold`\|`iron`), `hex` | `destroy()` | `destroy` |
| `Faction` | `faction` | `id`, `name`, `color`, `color2`, `ai`, `alive`, `res{gold,production,population,food}` | `canAfford(cost)`, `pay(cost)`, `receive(cost)` | `out`, `destroy` |
| `Region` | `region` | `id`, `center`, `cells[]`, `kind`, `name` | `control()` → `{owner, held, full}` | — |
| `Settlement` | `settlement` | `id`, `name`, `region`, `main` (hex), `district`, `founding` | `level`, `root` (геттеры) | — |
| `River` | `river` | `a`, `b`, `x1,y1,x2,y2`, `river`, `rand`, `bridge` | — | — |

Инварианты:

* `hex.unit === unit ⇔ unit.hex === hex` — менять только через `place/unplace`;
  `unit.destroy()` сам снимает себя с клетки.
* `hex.building === null` — пустая клетка; `building.kind === 'settlement'`
  означает поселение (размер — в `hex.level`), `'field'` — поле.
* `hex.occ` — кто оккупирует; `undefined` — никто. Оккупация превращается
  в захват в начале хода оккупанта, если его армия всё ещё стоит на клетке.
* `hex.settlement` — поселение, чей центр или район на этой клетке.

## 3. Справочники (`data/`)

| Таблица | Ключ | Поля |
|---|---|---|
| `TERRAIN` | тип местности | `label`, `color`, `move`, `defense`, `attack`, `impassable` |
| `RESOURCES` | `gold`, `production`, `population`, `food` | `icon`, `name` |
| `COSTS` | `recruit`, `reinforce`, `capitalBonus` | набор ресурсов |
| `RULES` | — | `maxArmy`, `movePoints`, `warriorStrength`, `capitalDefense`, `supportShare`, `wallDefense[]` |
| `LEVEL_NAMES` | `forest`, `farm`, `village` | три названия для уровней 1–3 |
| `FACTIONS` | индекс = `id` фракции | `name`, `color`, `color2`; `id 0` — игрок |
| `REGION_KINDS` | `settled`, `agrarian`, `industrial` | `label`, `hint` |
| `SPECIALIZATIONS` | `production`, `trade`, `food`, `civil` | `label`, `resource` |
| `BUILDING_TYPES` | `settlement`, `field` | `label`, `resource`, `baseCost`, `goldCost`, `canBuild(hex)` |
| `LOOK`, `LEVEL`, `THEMES`, `SPRITES`, `BUILDING_ART`, … | — | внешний вид (только отрисовка) |

Ресурс клетки — `hex.res` (считается генератором и пересчитывается после работ);
доход фракции за ход — сумма `res` всех её неоккупированных клеток плюс бонус
столицы (`COSTS.capitalBonus`).

## 4. Мир (`world/`)

```
WorldMap (type 'map')
├─ seed
├─ terrain : Terrain      правила местности: passable(hex), cost(hex), label(hex)
├─ hexes   : Map<'q,r', Hex>
├─ rivers  : Map<'hex|hex', River>
├─ regions : Region[]     id = индекс в массиве
└─ settlements : Settlement[]

MapGen.build(hexes, seed) → { rivers, regions, settlements }
   рельеф → суша → реки → регионы → мосты → поселения → угодья → ресурсы
```

Запросы карты: `get(q,r)`, `around(hex)` (все соседи), `neighbors(hex)` (без
непроходимых рек), `crossable(a,b)` (мост или нет реки), `ownedBy(pid)`.

## 5. Партия (`game/`)

```
Game (type 'game')
├─ seed, round, over, busy
├─ map : WorldMap
├─ factions : Faction[]     id = индекс; factions[0] — игрок
├─ relations : Relations    пары Relation, по умолчанию 'war'
├─ turns : TurnManager      порядок хода
├─ selected, mode, hover    состояние интерфейса (кто выбран и как)
├─ dirty, repaint           что перерисовать в конце хода
└─ messages[]               журнал

Relation: { a, b, state: 'war'|'peace' }   hostile → state === 'war'
Relations: between(a,b), hostile(a,b)      пара хранится один раз
```

Запросы партии: `player` (фракция игрока), `at(q,r)`, `isHostile(hex, pid)`
(чужая армия или война с владельцем), `log(text)`, `checkGameOver()`,
`finish(won, text)`.

Порядок хода (`TurnManager.endTurn`):

```
показ экрана хода
для каждой живой фракции ИИ:  AI.turn(id) → строки журнала → шаг экрана
доход: каждая неоккупированная клетка → её владельцу
завершение работ (Construction.finish): возврат, постройка, снос, вырубка
перерисовка карты вокруг изменившихся клеток (game.dirty → game.repaint)
сброс движения: unit.update() у всех юнитов
захваты игрока: occ → owner
round++, метка раунда, проверка конца партии, закрытие экрана
```

## 6. Правила (`rules/`)

| Модуль | Вход | Выход |
|---|---|---|
| `Economy.yieldOf(hex)` | клетка | ресурсы с бонусом столицы |
| `Economy.incomeOf(pid)` | фракция | суммарный доход за ход |
| `Economy.format(res)` | ресурсы | строка «💰12 ⚒3» |
| `Construction.actions(hex, pid)` | своя клетка без работ | список действий (построить, улучшить, сменить специализацию, снести, вырубить) |
| `Construction.order(hex, action, pid)` | действие | оплата и заказ работ на ход |
| `Construction.finish()` | — | завершает работы, возвращает их число |
| `Combat.defenseOf(hex, s)` | клетка | местность + стена города + столица + сила |
| `Combat.resolve(from, to, army)` | пара клеток | `{attack, defense, win}` |
| `Combat.interceptor(to, army)` | клетка | чужая армия, которая бьёт первой |
| `Movement.reach(origin)` | клетка с армией | `Map<hex, {cost, prev, kind, end}>` |
| `Movement.pathTo(route, from, to)` | маршрут | список клеток |
| `Movement.travel(path, pid)` | путь | `{result, trail, guard}` |
| `Actions.recruit(hex)` / `Actions.reinforce(hex)` | своя клетка с армией | найм за ресурсы |

Виды шага в `reach`: `own` (своя клетка), `claim` (свободная), `merge`
(слияние), `pass` (перепрыгнуть свою армию), `good`/`bad` (выигрышная или
рискованная атака), `end` — дальше идти нельзя.

## 7. Интерфейс (`ui/`)

| Объект | Роль |
|---|---|
| `Camera` (`camera`) | `x, y, scale, min, max`; `fit()`, `clamp()`, `zoomAt(factor, cx, cy)` |
| `Interaction` (`interaction`) | `select(hex)`, `move(from, dest, route)`, `animate(path, army)`, `point(anim)`, `anim`, `busy` |
| `PanelView` (`Panel`) | `update()`, вкладки `cell`/`region`/`army`, список фракций, кнопки работ |
| `TurnScreenView` (`TurnScreen`) | `show(round)`, `step(text, lines)`, `progress(frac)`, `hide()` |
| `Interface` (`ui`) | `update()` (кадр + панель), `renderLog()`, `overlay(won, text)`, `presenter()` |
| `Sprite` | строки символов + палитра → `stamp(ctx, x, y, k, exact, outline)`; кэш по паре «строки+палитра» |

`Interface.presenter()` — единственный мост от `TurnManager` к DOM: менеджер
зовёт `begin/faction/step/progress/round/repaint/end`, интерфейс решает, что
именно показать.

## 8. События

| Источник | Событие | Кто слушает |
|---|---|---|
| `game` | `log` | `Interface.renderLog` |
| `game` | `gameOver` (`{won, text}`) | `Interface.overlay` |
| `game` | `roundStart` | — (точка расширения) |
| `hex` | `capture` (`{hex, previous, pid}`) | — (точка расширения) |
| `unit` | `move`, `merge`, `upgrade`, `casualties`, `destroy` | — (точка расширения) |
| `building` | `upgrade`, `destroy` | — |
| `faction` | `out`, `destroy` | — |

Подписка: `game.on(EVENTS.log, fn)`; отписка — функцией, которую вернул `on`.

## 9. Что происходит при клике

```
клик по холсту
  → hexAtEvent(evt)                        экран → клетка
  → interaction.select(hex)
      если выбрана своя армия и клик по точке хода:
          interaction.move(from, hex, Movement.reach(from))
              Movement.travel → бой/слияние/оккупация/переход
              animate(путь) → кадры → ui.update()
      иначе: переключение режима (cell / region / army) → ui.update()
  → Panel.update()                          вкладки, кнопки, подсказки
  → кнопка работы → Construction.run(hex, action) → заказ на ход
  → кнопка «Закончить ход» → TurnManager.endTurn()
```

## 10. Будущие файлы

```
data/terrain.js  data/rules.js  data/factions.js  data/buildings.js
core/events.js   core/entity.js
hex.js           entities/unit.js  entities/building.js  entities/object.js
entities/faction.js  entities/region.js  entities/settlement.js  entities/river.js
world/terrain.js  world/map.js  world/mapgen.js
game/game.js  game/turn.js  game/relations.js
rules/economy.js  rules/construction.js  rules/combat.js  rules/movement.js  rules/actions.js
ai/ai.js
ui/camera.js  ui/interaction.js  ui/panel.js  ui/turnscreen.js  ui/interface.js  ui/sprite.js
boot.js
```
