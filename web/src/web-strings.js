// Web-only interface strings: temporary session storage, cross-tab conflict,
// clipboard fallback, unreadable records and the offline single-file note.
// Everything the browser build adds on top of the copied mini-program UI is
// translated here, in the same three locales as the shared catalogs.
import {current, LOCALES} from '../../src/i18n/index.js';

const index = () => Math.max(0, LOCALES.indexOf(current()));

export const WEB_STRINGS = Object.freeze({
  'web.storage.temporary': [
    '本机存储不可用，本次修改只保留在当前标签页，关闭后不会恢复。',
    '本機ストレージを利用できないため、今回の変更はこのタブ内だけに保持され、閉じると失われます。',
    'Local storage is unavailable. Changes stay in this tab only and are lost when it closes.'
  ],
  'web.storage.unreadable': [
    '本机记录无法读取，本次修改只在当前会话保留。',
    '本機の記録を読み込めないため、今回の変更はこのセッション内だけに保持されます。',
    'Saved records could not be read. Changes are kept for this session only.'
  ],
  'web.storage.writeFailed': [
    '写入本机记录失败，已保留上一次保存的内容。',
    '本機の記録を書き込めませんでした。前回保存した内容を保持しています。',
    'Could not save to local storage. The previously saved content is kept.'
  ],
  'web.storage.stale': [
    '另一个标签页更新了记录。为避免覆盖较新的内容，本页已停止写入。',
    '別のタブが記録を更新しました。新しい内容を上書きしないよう、この画面は保存を停止しました。',
    'Another tab updated the records. This page stopped saving so the newer content is not overwritten.'
  ],
  'web.storage.reload': [
    '重新载入最新记录',
    '最新の記録を再読み込み',
    'Reload the newest records'
  ],
  'web.copy.manual': [
    '复制没有成功，请长按或选中下面的文字手动复制。',
    'コピーできませんでした。下のテキストを選択して手動でコピーしてください。',
    'Copy failed. Select the text below and copy it manually.'
  ],
  'web.copy.title': [
    '手动复制',
    '手動でコピー',
    'Copy manually'
  ],
  'web.photo.unavailable': [
    '离线单文件版不含本机照片识别。请使用完整网页版识别，或继续手动录牌。',
    'オフライン単一ファイル版には写真認識が含まれません。完全版のウェブ版を使うか、手入力で続けてください。',
    'This offline single-file build has no photo recognition. Use the full web version or enter tiles manually.'
  ],
  'web.legal.title': [
    '开源与许可',
    'オープンソースとライセンス',
    'Open source and licences'
  ],
  'web.legal.summary': [
    '和啦的原创代码以 AGPL-3.0（AGPL-3.0-only）发布。本页已内嵌完整的 GNU Affero 通用公共许可证 v3.0 正文与 @kobalab/majiang-core 的 MIT 许可正文，无需联网读取。',
    '和らーのオリジナルコードは AGPL-3.0（AGPL-3.0-only）で公開しています。本ページには GNU Affero 一般公衆利用許諾書 v3.0 の全文と @kobalab/majiang-core の MIT ライセンス全文を埋め込んでおり、ネットワーク読み込みは不要です。',
    'The original code of Hela is released under AGPL-3.0 (AGPL-3.0-only). The full GNU Affero General Public License v3.0 and the MIT licence of @kobalab/majiang-core are embedded in this page; nothing is loaded from the network.'
  ],
  'web.legal.source': [
    '对应源码：同版本的 {file} 与本次下载放在同一处提供。',
    '対応するソース：同じバージョンの {file} を本ダウンロードと同じ場所で提供します。',
    'Corresponding source: {file} for the same version is offered next to this download.'
  ],
  'web.legal.agpl': [
    '展开完整 GNU Affero 通用公共许可证 v3.0 正文',
    'GNU Affero 一般公衆利用許諾書 v3.0 の全文を開く',
    'Show the full GNU Affero General Public License v3.0'
  ],
  'web.legal.mit': [
    '展开 @kobalab/majiang-core 的 MIT 许可正文',
    '@kobalab/majiang-core の MIT ライセンス全文を開く',
    'Show the MIT licence of @kobalab/majiang-core'
  ],
  'web.legal.note': [
    '第三方组件各自保留原有许可与来源说明；源码包内 THIRD_PARTY_NOTICES 与 LICENSES 列出全部条目。此处不宣称整体法律合规。',
    '第三者のコンポーネントはそれぞれ元のライセンスと出所表示を保持します。ソースアーカイブの THIRD_PARTY_NOTICES と LICENSES に全項目を記載しています。',
    'Third-party components keep their own licences and attributions; THIRD_PARTY_NOTICES and LICENSES in the source archive list them all. This is not a claim of overall legal compliance.'
  ],
  'web.legal.missing': [
    '正文未随本次运行环境内嵌，请查看源码包内的 LICENSE 与 LICENSES/MAJIANG-CORE-MIT.txt。',
    '全文はこの実行環境に埋め込まれていません。ソースアーカイブの LICENSE と LICENSES/MAJIANG-CORE-MIT.txt を参照してください。',
    'The full texts are not embedded in this runtime; see LICENSE and LICENSES/MAJIANG-CORE-MIT.txt in the source archive.'
  ],
  'web.offline.note': [
    '离线单文件版：所有数据只保存在本机，照片识别请使用完整网页版。',
    'オフライン単一ファイル版：データは本機のみに保存されます。写真認識は完全版ウェブ版で利用できます。',
    'Offline single-file build: data stays on this device. Photo recognition is available in the full web version.'
  ]
});

export function webText(key, locale = current(), params = null) {
  const values = WEB_STRINGS[key];
  if (!values) throw new Error('Unknown web string: ' + key);
  const at = locale === 'ja' ? 1 : locale === 'en' ? 2 : 0;
  const text = values[at];
  // Only named placeholders are substituted; the text itself is never markup.
  return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
}

export const webTextIndex = index;
