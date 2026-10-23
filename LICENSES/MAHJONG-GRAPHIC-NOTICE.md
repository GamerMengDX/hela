# 牌面素材：来源与许可 / Tile artwork provenance and licence

> **结论（先看这一段）**
>
> 37 张牌面 **不是本项目原创**。它们来自上游开源仓库
> [`lietxia/mahjong_graphic`](https://github.com/lietxia/mahjong_graphic) 固定提交
> `3e275804ff58325306710bef3a7406860444bc6a` 的 `Vectors 矢量图/SVG/` 目录，按上游给出的
> **M+ 字型授權條款 / M+ FONT LICENSE** 使用。
>
> 因此牌面**不按 AGPL-3.0-only 授权，也不按 MIT 授权**；本项目原创代码仍是 AGPL-3.0-only。
> 两套条款各自成立，互不覆盖：

| 对象 | 许可 | 正文 |
| --- | --- | --- |
| 本项目原创代码（`src/`、`web/`、`scripts/`、两端小程序代码等） | **AGPL-3.0-only** | [`LICENSE`](../LICENSE)、[`LICENSES/AGPL-3.0.txt`](AGPL-3.0.txt) |
| 37 张牌面矢量图（`assets/tiles/*.svg` 及由它栅格化的 `*.png`） | **M+ 字型授權條款（上游声明）** | [`LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`](MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt)（上游 `LICENSE` 原文） |

## 一、上游定位（固定提交，可复现）

| 项目 | 值 |
| --- | --- |
| 仓库 | https://github.com/lietxia/mahjong_graphic |
| 镜像 | https://gitee.com/lietxia_admin/mahjong_graphic |
| 固定提交 | `3e275804ff58325306710bef3a7406860444bc6a` |
| 提交时间 / 标题 | 2023-05-14T13:23:02Z · `fix TYPO` |
| 牌面所在目录 | `Vectors 矢量图/SVG/` |
| 上游 `LICENSE` | git blob `d942c40e76dd80761757b9e16cee10f8585d14da` · sha256 `574ae3c0481c5648b56c9cd268ba0b879e100ae32a29b0a2583262196b188e8a` · 782 B |
| 上游 `readme.md` | git blob `c991594d7eec3ca86cee4f6107e711ba6867e48f` · sha256 `5b5c5d7f8c0e8dca187dbbb445ae1ffe436f1fdf47b5f9e87b55127228ce1bd2` · 2107 B |
| 获取方式 | 只读获取：GitHub REST API /git/trees 固定 commit 的目录树 + 固定 commit 的原始文件（LICENSE、readme.md） |

两份上游正文都随包提供，不是链接替代品：

- [`LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt`](MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt) — 上游 `LICENSE` 逐字节原文（含中日英三语 M+ 条款）；
- [`LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md`](MAHJONG-GRAPHIC-UPSTREAM-README.md) — 上游 `readme.md` 逐字节原文（含同一份许可条款与下面的来源链自述）。

逐张的机器可读记录在 [`assets/tiles/art-provenance.json`](../assets/tiles/art-provenance.json)，
构建与校验脚本读的就是它。

## 二、我们改动了什么

**图形本身一处都没有改。** 没有重画、没有改色、没有简化路径、没有替换字体，也没有把 SVG 转成别的格式再转回来。
唯一的差异是**行尾**：

- 上游文件是 LF 行尾，本工程副本是 CRLF 行尾：本地文件比上游多出的字节数**正好等于该文件的行数**
  （逐张 15–62 行不等，即多 15–62 字节），除此之外没有任何差异；
- 把本工程副本的 CRLF 归一化为 LF 后，**git blob sha 与上游完全一致**——这一点逐张写在下面表格的最后一列，
  任何第三方都能独立复算；
- 因此本工程副本的 git blob sha 与上游不同，我们**没有**把它伪造成“精确字节匹配”。

原始 37 个 SVG 就以这个形态留在 `assets/tiles/` 里，没有另存一份“更干净”的副本；两个小程序端的 PNG
和示例牌条都是从这些 SVG 现场栅格化出来的，栅格质量参数固定，可重跑。

## 三、上游自述的来源链（原样保留，不做扩张）

上游 `readme.md` 写明（原文见上面那份 README 逐字节副本）：

1. 部分图形来自「一点麻将」I.Mahjong — <https://github.com/SyaoranHinata/I.Mahjong>；
   范围是“一万至九万、东南西北白发中，其中一种一索，其中一种一筒”；
2. 「一点麻将」是用 GL-MahjongTile 修改的；
3. 上游把整套图形按其 `LICENSE` 的 M+ 字型授权条款释出。

已知的权利边界，我们如实记在这里：

- 上游**没有**为 I.Mahjong / GL-MahjongTile 单独提供许可正文，只给了这条文字来源说明。
  本工程保留上游给出的条款与来源链，不替上游改写、不替上游扩张，也不宣称这条链之外的任何权利；
- 这张链条意味着牌面图形的权利状态比“单一 MIT 组件”复杂。需要更强保证的再分发者应自行判断，
  本文件**不构成法律意见**。

## 四、逐张对应表（37/37）

校验方式：把本工程副本的 CRLF 归一化为 LF，取 git blob sha（`sha1("blob <len>\0" + content)`），
应当等于上游该路径在同一提交上的 blob sha。37 张全部命中。

| 本工程文件 | 上游文件 | 本工程 sha256（CRLF） | 上游 sha256（LF） | 上游 git blob sha |
| --- | --- | --- | --- | --- |
| `m0.svg` | `0m.svg` | `a45240807fa8c4a7a51a293c6cea6cbcf2c265fd77645d847fbbc87a191851df` | `b5c5a1557cbc7f104ee31b1ae4b93fd1983c97ca41c33f598ebfd058d5b06dac` | `a9b1e8b83fb05447d1e72358144d354b363df8db` |
| `m1.svg` | `1m.svg` | `04ee208e946dd6137da95ce243aa8bb6250be839362be068d712ee442e937d55` | `0bee1524e68b8cc916d6ed79529a32274e045b432c3d341644c2bc5f311783f9` | `af08ff0f1faa1fcf878a11df56726464ecab2c01` |
| `m2.svg` | `2m.svg` | `0973b47d6d9b1d8a574a0ab4d8df6ba8e9c14203f30c6510dd21753ca7aef89a` | `949efe31438e204c7ffbbde8c1a9c25911c1e3ecc22d47a46de028fab64dad44` | `949f57b2431dca641c4fe019806bc5cf8a636c5a` |
| `m3.svg` | `3m.svg` | `94e883c76622352f4b66b012ba0ffa8a6315bffa9660dc39429fd15a7f9edb53` | `f8ecd295ec03eef35113496b15304af2427fd7987438e90082f13e9b0ab9a79b` | `f65c717bbda7be3d6c8f91f067925b06cca12b29` |
| `m4.svg` | `4m.svg` | `1e96f36c69e0c7672adee3ff307d57a288948113080ef67544c73b8a6ec603ee` | `4c6475951ff832a97d615700c8db1657e96830448df3ed7fbe941b17681ebaed` | `a746efb4c69b5bc96d2b861e36bdb7e3b29be3d5` |
| `m5.svg` | `5m.svg` | `f688c44af85c1c95f0e51eca5c11d6a09af8b302466d5eed20f54f01c54246e4` | `ab2081cd04aaee4f83ed0fce7c148f5d21ef671618afbfa59d12d8e26630a603` | `3060a3bca77e7ae3f881ef64a03fc562f99f3960` |
| `m6.svg` | `6m.svg` | `6fc8ccdb13e1c7db8b5c49d3f2f8cd7e924d7920feabd0aee2e15bf8d64b8401` | `1692f679169ac6e6125c67808946ddb5aae47a460b2bd6d558f5aa95fc7a946c` | `51afaf364207ba06a8b0ef974ebd46460ae2fa6e` |
| `m7.svg` | `7m.svg` | `eb95dddbe36ad9dfdc5be659a9fe0a608d527d73eb82e4d823c0c548b4af79a7` | `a9fc3df811445f006f3a4026a7e78012fe9bb3bbb5cac64e9c4dbcc992391ab2` | `bd81c7cf5f02d4080dc80ad1dad836f95f55fd61` |
| `m8.svg` | `8m.svg` | `f08ce2c21e70292e5d116222f9cf377824acbc19e54c912fd8d94715a5eb2607` | `5c5f1c9373402c6c07b2f23b79b2b8f08fe953aa937153bbc3a4cd813d704c98` | `61519f0eb60671116f1696022c5f9fc890b58f91` |
| `m9.svg` | `9m.svg` | `2c8b7538f38865e99c139e5679e7b5e7f2025992fa34595189407296c944231d` | `5452cb8a6adde55372578559ed6033f9fe2c05f4d30b56181060d0dd99779295` | `1d97c50569f8c53626e79513510dbb7d0460f09c` |
| `p0.svg` | `0p.svg` | `0f495bfe70df94121531177ec5b5cdb8b361388b599520f2918734018ed67350` | `25bbcdcc09bd5bd23069decb65245a39ae466ab4481677829485038df47467c7` | `c6100883227f838d843bbe6c3e659afdd4fdc4f3` |
| `p1.svg` | `1p.svg` | `bcea271f4955e9e48768a8683bfeb14d11d090936e7ea0ef1a0f08eb64c27489` | `3920ba84c93876c05450488015908185d999a36689a0ea4bccc1944f6c0c5adb` | `66820efa5fec46f0ad8b013a80dc485398b3ec9f` |
| `p2.svg` | `2p.svg` | `1b7f70012402cc189eca85203cec8cf9d90cf562b43cad151e0ae8e3316be080` | `6e6c305c514b3f345788d9fed9ad6ee5583c989f1d9f694f1090b4cf5967235d` | `051464906042afffe73029ade0b55c5ecb12418e` |
| `p3.svg` | `3p.svg` | `f2482321bab154a1d1ab95ec70fce42043958146fb8eb3cac0f5e4cf3182cb0c` | `bd204b18eda2aeaaf389f0b55e849ffad9e42e1d94b69760b7a7c3a7b883a687` | `0e5ef429ba6346d3f20243fdd6ecd981d7455dc5` |
| `p4.svg` | `4p.svg` | `95c82b31f076650feece4287755ebea5e64ba5f672f3b138ee7d5457fbd4f4d5` | `1d90adf6fe71f9ca6684e5c3815f02a6747704e89504baf98c7409f7a74b55e0` | `f810f545edf14abdaa57582f27e21e8cc161bae2` |
| `p5.svg` | `5p.svg` | `282788cb63245d7ac60846fa9c48415f172d5df8cbcab6a03d4b3714752173ff` | `9def7594f55cab98e943b8a41721305e53ecf8897bfd9cd740032ea5dcf247d5` | `3a07d6f588d36f2973f91494d7de61a6a21d00a5` |
| `p6.svg` | `6p.svg` | `f7fc7144c1e1220861372ea07fd43afc08afa21962c13c324732d6c02435f785` | `75c268786dfb459444e47660dac461aef3126f07032b35f83f3191ac37fa6cfa` | `b980b024383e4cafcbb318e6580b562d1934cff0` |
| `p7.svg` | `7p.svg` | `e34b003d6808c37c42d727f67dac9f00640496b98f3340bb226e1290249ff780` | `e21cb9a8573e339811b6a1784130e223a649c2f7d7bc06c4e66888d0be3b35b8` | `b4ae0508ef35bd29de53876c892f3aac073b1ca7` |
| `p8.svg` | `8p.svg` | `dc24c32d68e6350f651807d82789c74e82a9b999a7b91ea3af56b8e5c4205fc1` | `983bfad0d8d61e0583b19f84e58b92a8e4061853ff62e39c3a82103f2ffa6a7b` | `30bcba338b85145916785561034e2b143722ee26` |
| `p9.svg` | `9p.svg` | `a3f4efc20cee3689ac6b4a1c407000baf31606e4569255d377d75352832bb955` | `4e635afc8b567aba7e34035f78832247c69a416107392df9bd1e0479da8da7a4` | `45a4ad5a2dcc39b64a28d43d8e7662ae8bb6a158` |
| `s0.svg` | `0s.svg` | `5a58d5eae6bb02d3496ec81d321d3cedba0abc24228935df4e4086bae64f1195` | `98c9b8b0fb0a0691217e5a50cae28be431c972d9979691d7b6534ba46e5896d3` | `7dd599df9a8a395bf5711ab353fe71aee4435744` |
| `s1.svg` | `1s.svg` | `1b7dd03b4a17cfd879ffdbf9b3d52f0ead561c5e0a0af91e8365acecedb93c2a` | `8ddad74fa92715079269ebcc15e61047a82875184f9f8a549000d934860bf70c` | `a46bf73940c0ff973a60c4bd2ce3db8a4a0ff9cb` |
| `s2.svg` | `2s.svg` | `1157667926fe6cb678ccb44be652d2edb8b6af066217c8c3cd39129b3964f8e4` | `24813ffd97c74c948f32f0026fa18732da1466bbf1adb89f74dc33c5aaf6f4b0` | `6e83081e6b184d8d5d0b4fb6e9f8432140dafbdf` |
| `s3.svg` | `3s.svg` | `8b2792d6b94649cd13f2e1a136b9d92bf3bc205556f9c74a90b53ffcdc4dcf71` | `f840e98222456d91f2ed8a2fe5702f0dc0df95e88915bfd2112b1855c9429e56` | `f8bcb0036ff38d4215406d2d0222ad2e48b2f40f` |
| `s4.svg` | `4s.svg` | `b0373a0dfd396aebedfa66e47b5fd46aea493776e00c2f8d2c49f709617d1ad3` | `4f2ca4054892f3e24ee5c99170eac58ec73723e10a5d0e69967917eeac55a018` | `ad84e4a8ebbf9c049b5dc061fcf7e0f7d2357696` |
| `s5.svg` | `5s.svg` | `f46dfd96d3b2cde3acf52df632a4287da1faa585bc7c234b7125a6dec0081422` | `74a3e3c6a4f9e9a64e1ef4b59fb6150321c6267c7701fb2eb02b03d106106e77` | `406b556b472068b2a99451e8e9e7007206256372` |
| `s6.svg` | `6s.svg` | `1d05a8f8fb70e2d9e733524a3745c189ad3eef6f7b74c968020eebda984d291a` | `525ff232424ef7692219c53ede477aa2c33e670b2ad31c8190e38e6cb76bb3cb` | `2c5f4345d8ba71a7bfd60c9ef8bb8dc19857899d` |
| `s7.svg` | `7s.svg` | `a1e9544e2433ecfafc9c726209a02ee1fcfdd3869d2e87c3cbc0d565b5e759c4` | `9ad2bda746d86e7a493b1c9745abd91a5f764d58a74231bd649902c1a5e826c5` | `6ed923fae23a91bf77422047197ef2b3f6008211` |
| `s8.svg` | `8s.svg` | `4f5ff3adead90fad72b0d22917396a5a73c9f8a9926021ffa26aee7d06a62b43` | `fd16dce809607fffd257d8d5c05962f79c07ea8234b2fd55fb69426390d123a2` | `31fc4d506a0a781714b44e246aaaa1d5c68742be` |
| `s9.svg` | `9s.svg` | `b9d9815cf0b389c3c3af0b0bc2541fdfed3d1fccc662860460fcf6aec68abc78` | `22097601b54c79242f0c21c7008b99b49592dd1e6ea00aeec7cd636e006fa826` | `4e3478940a1d8ed82c7a2ddab497c84c1350ef12` |
| `z1.svg` | `1z.svg` | `9bc044758111744cf390aada9446f6ffbd9474aa125b8e72ceaf36887ab70909` | `bf44118e4c3c7313f7b9ec45a94580197fab2d15974e453c96574063d06b502a` | `f7fb2006b456006a72f630334e42e79991cdf3ea` |
| `z2.svg` | `2z.svg` | `37acdfeab7c441af875704396df5203e710f731ed5fb49b3e5f470e6bc0a4d89` | `163e9b8dc6fd83bbb03bd5f516680af6fc27ee089dda73a78051c0bab8a66c27` | `70b991e1817a26fcc1b9d940d032619506b89bc6` |
| `z3.svg` | `3z.svg` | `0e5a270ce36a0651272f03668aa42c6b3bdac5e1afebd4ef4cec7de5889585f6` | `14d08835765cfe508dfa099248532eaef20ab26a636afecb1602b550bbaec9ad` | `1038973962b0f5068afa05276ac5cc0daa6974b1` |
| `z4.svg` | `4z.svg` | `24fb79efeda970317c159298aa7b8ccf11ea6b9a6524dc73bef3d2357bd7acf8` | `10bec33ede1f680d96e04c390cc3faa7c91e286dc95aa1ed166ef43bdac5cb78` | `5fa206f1a172de6b1d4638bc9ce2bf2904e9a6d1` |
| `z5.svg` | `5z.svg` | `561cfd59c3f116faa0d1faabdd1418fc7dc0bfee2ec5b328392a03c0065ca59f` | `a5385b02bbde9b581577d0c9118f8cf549900056145cfe7a4f7076e058bc31d4` | `e2a34ee9e52909c322be918735b2ff3ae20ba9c7` |
| `z6.svg` | `6z.svg` | `d2cc48fe1cea52385c3b462cf84ac62b02b12f01be04b2ce2db91c683ebf9955` | `22624a5e2cc6a4a6469f8fe9d49d6637cd3fa13e697f4baf1a52f8856831d31c` | `97db55d7668d6024585c28d185fd03db190e3d59` |
| `z7.svg` | `7z.svg` | `753b8596f4a7be56d4ef10005e710d98393e00c8cddc4bb38020b16a4e61bd6f` | `2cff86503ee877371f9dbaa494aec0078a5fc6f45cf3f19aede5330b0f74d66f` | `5ac12f4a2f8fc6f82f04d74f7b8cc93de844ca06` |

## 五、怎么自己验一遍

```bash
npm run check:assets     # 校验 37 个 SVG 未被替换、两个小程序 PNG 与示例牌条与生成结果逐字节一致
npm run check:public     # 校验许可正文齐全、牌面哈希与 art-provenance.json 一致
node scripts/source-manifest.mjs   # 逐文件哈希
```

重新从上游取一遍（只读，不写入本工程）：

```bash
COMMIT=3e275804ff58325306710bef3a7406860444bc6a
curl -sSL "https://api.github.com/repos/lietxia/mahjong_graphic/git/trees/$COMMIT?recursive=1"
curl -sSL -H 'Accept: application/vnd.github.raw' \
  "https://api.github.com/repos/lietxia/mahjong_graphic/contents/LICENSE?ref=$COMMIT"
curl -sSL -H 'Accept: application/vnd.github.raw' \
  "https://api.github.com/repos/lietxia/mahjong_graphic/contents/readme.md?ref=$COMMIT"
```

## 六、使用牌面时请留意

- M+ 条款的要点：可以自由使用、复制、分发、修改，商用与非商用都可以，**无任何担保**。完整表述以上游原文为准。
- 上游仓库的说明里同时提到其矢量源文件（`Vectors 矢量图/mahjong.ai` 等）与 PNG 位图目录；本工程**只**取了
  `Vectors 矢量图/SVG/` 下的 37 个 SVG，没有取 `.ai`、PNG 位图、雀魂样式或扁平风格等其它目录，也没有取花牌/季节牌。
- 牌面用在微信/小黑盒小程序时，除上述条款外还要遵守平台自身的素材与审核规则；本项目不对平台侧的审核结果作保证。
- 品牌名称与品牌图标不属于这套牌面，其重用条款由项目方保留，见 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。
