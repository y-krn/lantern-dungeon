# 主人公の歩行画像

## 脚の交替

歩行は上半身・太もも・すね・靴のパーツを合成して描画します。左右の脚を半周期ずらし、接地中の足は体に対して後ろへ送り、もう片方は持ち上げて前へ戻します。奥の脚は同じ陰影と重なり順を維持するため、どちらの脚が前に出たかを追えます。膝を曲げても靴底の傾きは固定します。

全8方向で6コマを使い、2マスの移動で一巡します。前・後ろは奥行き方向、斜めは横と奥行きへ足運びを投影し、左側の方向は対応する右側の表示を反転します。完成した30種類の姿勢はキャッシュし、描画中に画像を再生成しません。停止・攻撃・階移動・動き軽減設定は従来の制御に従います。画像の読み込み失敗時は従来の歩行画像、立ち姿、ピクセル描画の順に代替します。

旧画像は前後半で同じ脚の姿勢を繰り返していました。足元の透過形状や描画画像の枚数だけでは、この問題を検出できませんでした。テストでは手前と奥の靴を区別し、前後の交替、支持脚の後方移動、反対の足の持ち上げを調べます。確認画面の拡大・低速・コマ送りに加え、自動プレイの実描画を連続保存して通常サイズでも確認します。

- `dist/art/hero-side-rig.png`: 横向きの上半身と、全方向で共有する太もも・すね・横向きの靴。
- `dist/art/hero-direction-rig.png`: 前・前斜め・後ろ斜め・後ろの上半身と、正面・背面の靴。
- `dist/art/hero-walk.png`: パーツ画像を読み込めなかった場合の代替画像。

2枚のパーツ画像は既存の主人公を参照して組み込み `image_gen` で生成しました。透明な出力をそのまま保存し、実行時に各パーツを切り出します。

### 横向き・脚パーツの採用プロンプト

```text
Production 2D game PAPER DOLL RIG asset kit on true transparent background, matching the reference girl's warm watercolor storybook art. This is NOT a walk cycle. Exactly FOUR SEPARATED PARTS with large transparent gutters.
Layout on a wide canvas: LEFT HALF one large upper-body cutout. RIGHT HALF three isolated small parts, one above the other. No text, labels, grid, ground, shadows or extra figures.

PART1 LEFT: exact right-facing girl upper body, hat with leaves, twin braids, green cape with flecks, cream blouse, brown shorts with pouches, brown backpack and tan bedroll, glowing orange lantern held in front. Preserve the reference character and consistent proportions. REMOVE BOTH LEGS AND BOTH BOOTS COMPLETELY. The bare leg openings of shorts are at bottom of torso; nothing extends out of shorts. The lantern remains complete and hangs BELOW the shorts on the right. This is a floating torso CUTOUT for animation, not a cropped rectangular picture. Full hat, pack and lantern intact. No legs, no knees, no feet attached.
PART2 TOP RIGHT: one isolated STRAIGHT BARE THIGH segment, pale warm skin, watercolor shading with fine outline, vertical from a rounded hip at top to a rounded knee at bottom. A simple oval tapered cylinder about 35px wide and 65px long relative to a 400px tall body. No clothing, no boot, no foot, no duplicate segments.
PART3 MIDDLE RIGHT: one isolated STRAIGHT BARE SHIN segment, same pale skin and outline, vertical from rounded knee at top to narrow ankle bottom, about 25px wide and 55px long relative to body. No clothing, no boot, no foot.
PART4 BOTTOM RIGHT: one isolated BROWN LACE-UP ANKLE BOOT from the reference, viewed from right side, TOE POINTING RIGHT, sole perfectly HORIZONTAL. Open ankle shaft VERTICAL. Warm brown leather, laces, cuff, outlined sole. About 58px wide and 42px high relative to body.

The separate thigh, shin and boot will each be drawn twice by the game, one darker for far leg. Do not put both legs in any part. Only ONE of each component. Keep the left upper body with absolutely no legs below shorts. Same watercolor style for all four components. Transparent background everywhere outside the four isolated pieces.
```

### 方向別パーツの採用プロンプト

```text
Game animation PARTS ATLAS, transparent background, matching the reference girl's watercolor storybook art and identity. NOT a walk cycle. FOUR LEG-FREE UPPER BODIES in a single evenly spaced top row; TWO BOOTS on a bottom row. No text, labels, grid, floor, shadows, extra figures.
Canvas landscape 1536x1024 preferred.
TOP ROW four cells, left to right:
1. FRONT facing viewer/SOUTH: exact reference first-row girl upper body, full hat, face, arms, green cape, short brown shorts, backpack. Orange lantern in anatomical right hand, on LEFT side of picture. REMOVE BOTH LEGS AND BOOTS entirely below the shorts. Full lantern preserved.
2. FRONT RIGHT diagonal/SOUTHEAST: same exact reference second-row girl upper body, face looking down-right showing both eyes, hat and backpack. Lantern in front on RIGHT side of picture. REMOVE BOTH LEGS AND BOOTS below shorts. Full lantern preserved.
3. BACK RIGHT diagonal/NORTHEAST: same reference fourth-row girl upper body, head facing up-right AWAY from camera, mostly back of hat and backpack, tiny right cheek sliver, no front-facing eyes. Lantern on RIGHT side of picture. REMOVE BOTH LEGS AND BOOTS. Full lantern preserved.
4. BACK/NORTH: same reference fifth-row upper body, facing straight AWAY, back of hat, twin braids, brown backpack and tan bedroll, green cape and shorts visible at bottom. No face or eyes. Lantern on RIGHT side of picture. REMOVE BOTH LEGS AND BOOTS. Full lantern preserved.
All four upper bodies same height and body proportions, completely isolated with large transparent gutters. No knees or calves attached. Slight flesh in shorts openings okay, but NO LEGS below.
BOTTOM ROW:
Left half: ONE isolated brown lace-up boot viewed STRAIGHT FROM FRONT, toe toward viewer, open ankle shaft at top, laces centered, sole horizontal, no foot or leg attached.
Right half: ONE isolated matching brown ankle boot viewed STRAIGHT FROM BACK, heel toward viewer, seam centered, no visible laces on heel, sole horizontal, open shaft at top, no leg attached.
Both boots same height and size; each one isolated with transparent margin. Parts cleanly separated, bodies top and two boots bottom do not touch. All four complete bodies must end at shorts, NO legs. This is a paper-doll animation kit where the game will add moving leg parts. Warm detailed watercolor, thin dark outlines, no pixel art.
```
