# 主人公の歩行画像

## 横方向の足運び修正

横歩行は `dist/art/hero-side-walk.png` の専用6コマを使用します。接地で足を開き、体重移動で支持脚を体の下へ送り、反対の足を持ち上げて前に通します。左右の横歩行は同じ画像を反転して使用し、それ以外の方向は従来の4コマを維持します。横移動は1マスの移動中に6コマをすべて再生し、一歩の途中で支持・通過の姿勢が省略されることを防ぎます。

前の画像は切り出し領域が別でも脚の姿勢が似ており、画像の識別だけでは確認が不足していました。`tests/check-footfall-art.cjs` はPNGの足元の透過形状を調べ、接地で開いた足、片足支持、支持した靴が体の下を後ろへ動く違いを検証します。確認画面の「足運びだけ（拡大）」「ゆっくり」「次のコマ」でも、画面上の移動を止めて確認できます。

専用画像は既存の主人公を参照して組み込み `image_gen` で生成しました。採用画像の生成プロンプト:

```text
Use case: identity-preserve. Production GAME WALK CYCLE sprite sheet, ONLY SIX frames of the SAME right-facing character. Reference is the attached existing game atlas; use its third figure on the top row (right-facing side view) as the exact girl identity. Ignore all other creatures.
Create one HORIZONTAL ROW of 6 equally spaced sprites, exactly 6 columns x 1 row. Wide canvas 1536x512 preferred. True transparent alpha. Fully isolated sprites with transparent margins, no text, numbers, arrows, grid, background, floor or shadows. All faces point EXACTLY to the RIGHT. Same scale, same hat, same upper-body position and same feet ground baseline across all 6.
PRIMARY TASK: GENUINELY DIFFERENT FOOTFALLS, NOT SIX COPIES AND NOT TWO POSES REPEATED. Preserve torso/head/cape/lantern as much as possible; change LEGS and BOOTS visibly. Girl has exactly TWO LEGS and TWO BOOTS. Use a normal grounded WALK, not running, jumping, or skating.
Column 1: CONTACT A. Near/camera-side leg straight FORWARD with heel touching ground at x=hip+32px. Far leg extends BACKWARD at x=hip-32px, back heel raised.
Column 2: WEIGHT/DOWN A. Near planted boot has moved BACK to x=hip+10px under the body; far leg is bent behind and lifting off. Knees flex slightly. This must be much NARROWER than column1.
Column 3: PASSING A. Near support leg now nearly vertical at x=hip-12px, sole grounded. FAR leg swings forward with bent knee; its boot is lifted about 30px ABOVE the baseline beside the grounded leg. Both feet clustered under hip, not a repeated wide split.
Column 4: CONTACT B, OPPOSITE LEG of col1. FAR leg straight FORWARD at hip+32, heel contacting ground. NEAR/camera-side leg extends BACKWARD at hip-32, toe behind with heel lifted. The overlap of thighs and boot order must visibly swap from col1. Do NOT repeat col1.
Column 5: WEIGHT/DOWN B. FAR foot planted at hip+10; NEAR leg bent behind and lifting. Narrower stance than col4. The opposite leg is supporting compared with col2.
Column 6: PASSING B, OPPOSITE support of col3. FAR supporting leg nearly vertical at hip-12 with sole on ground. NEAR leg knee bends FORWARD, and near boot lifted 30px off the floor beside grounded foot. Do NOT repeat col3.
Feet travel BACKWARD on the ground relative to the moving torso while planted, then swing FORWARD off the ground. Strong clear lower-body silhouette changes, wide contacts versus narrow passing poses. No front leg permanently stretched forward. Keep thigh/calf lengths consistent. Both boots visible and separated in all frames.
Identity locked to reference: small friendly brown-eyed brown-haired girl, brown floppy wide-brim pointed hat with leaves, twin braids, cream blouse, short green cape with golden speckles, brown shorts and belt pouches, brown lace-up ankle boots, brown leather backpack with tan blanket roll, glowing amber lantern held consistently forward in the same hand. Warm watercolor storybook paint and crisp fine dark outlines, NOT pixel art, NOT photoreal, NOT a new costume. Cape/lantern swing subtle; character must not turn camera between frames. Upper-body should be nearly identical so the visible animation comes from genuine alternating legs. Keep hat and lantern entirely in the cell. Character occupies 80% of canvas height, consistent cell width. No extra character, no props from the monster rows.
```

## 初回の8方向歩行画像

`dist/art/hero-walk.png` は、既存の `dist/art/lantern-atlas.png` を参照し、組み込みの `image_gen` で生成した透過画像です。既存の立ち姿、敵、アイテムの画像は置き換えていません。

下、右下、右、右上、上の5方向に各4コマを用意し、左側の3方向は対応する右側の画像を反転して描きます。帽子、マント、ブーツ、ランタンを含む範囲を切り出し、方向ごとに同じ大きさのキャンバスと接地位置を使います。コマ番号は描画上の移動距離に同期し、停止時には元の立ち姿に戻します。

生成時の最終プロンプト:

```text
Use case: identity-preserve. The attached atlas is the exact character reference: ONLY its first 8 girl sprites, ignore monsters. Deliver a NEW production-quality WALK ANIMATION SHEET on TRUE TRANSPARENT background.
LAYOUT 4 columns x 5 rows = exactly 20 sprites, uniform rectangular cells, portrait canvas 1024x1280. Rows MUST be:
row1: FRONT toward viewer / SOUTH, all 4 figures face front.
row2: FRONT-RIGHT diagonal / SOUTHEAST, all 4 face screen right with most face visible.
row3: EXACT RIGHT PROFILE / EAST, all 4 face SCREEN RIGHT, one eye visible, nose pointing right.
row4: BACK-RIGHT diagonal / NORTHEAST, all 4 face screen RIGHT away from viewer, show mainly the backpack and back of hat, only a small right face sliver. Absolutely NO left-facing figures in this row.
row5: BACK / NORTH, all 4 face away, NO face visible.
For each row: camera direction is locked IDENTICAL across all columns. Same head size, same clothing, same exact hat silhouette, same centered torso position and boots baseline across columns. Change ONLY legs and slight arm/lantern swing. Four visibly DISTINCT walking phases: column1 LEFT FOOT clearly forward RIGHT FOOT clearly back; column2 RIGHT knee lifting/left foot planted/feet passing; column3 RIGHT FOOT clearly forward LEFT FOOT clearly back (opposite of col1); column4 LEFT knee lifting/right foot planted (opposite of col2). Every sprite has two visible boots. No jumping and no stationary four copies.
IDENTITY match reference: friendly brown-eyed brown-haired chibi girl, brown floppy pointed hat with leaves, twin braids, cream blouse, green short cape, brown shorts, belt pouches, brown ankle boots, small brown backpack with tan blanket roll, warm orange glowing lantern. Watercolor storybook shading, dark warm outlines. Keep reference proportions and recognizable face; no giant backpack or changed hat.
CRITICAL LANTERN continuity: same ANATOMICAL RIGHT HAND for ALL 20 sprites. Therefore lantern on LEFT side of image in all FRONT row1 frames; lantern in front of girl on RIGHT side for the RIGHT-facing row2 and row3; lantern on RIGHT side for BACK-RIGHT row4 and BACK row5. The lantern must NEVER switch screen side between columns in the same row. Do not alternate which hand holds it. Arms may swing slightly but not across torso. This is a biomechanically coherent cycle, no costume or camera variation within rows.
Uniform 4x5 exact grid, full silhouette in every cell with empty transparent gutters. Feet must not cross cell edges; no lines, labels, text, ground, shadows, background scenery or painted checkerboard. The character art should occupy ~85% cell height, same height per frame. Keep front/back head perfectly steady and make actual leg movements clear at 48px tall.
```
