# 主人公の歩行画像

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
