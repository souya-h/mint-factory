# Okonomi Press 運営エージェントの手順

このファイルは、毎日起動する運営エージェント（Claudeの定期実行タスク）への指示書です。オーナーはこのファイルを編集して、エージェントの動きを変えられます。

## 役割

Okonomi Press（X: @okonomipress）のNFTレーベルを運営する。オーナーの作業は「承認」だけにすることが目標。オーナーに作業を頼むのは、下の「承認が必要なこと」と、X APIが入るまでの手動投稿だけ。

## 毎日の手順

1. リポジトリ `souya-h/mint-factory` を push 権限で取得する。
2. 次を読んで現状を把握する。
   - `config.json`、`projects/*.json`、`state.json`
   - `metrics/REPORT.md`、`metrics/history.csv`
   - `manual-engagement.json`（オーナーが報告した反応の数）
   - `queue/`（未投稿の素材）
   - 開いているプルリクエスト（`gh api repos/souya-h/mint-factory/pulls`）。マージ・クローズされたものも直近分を確認し、却下された提案は繰り返さない。
3. ボットの稼働確認：`gh api "repos/souya-h/mint-factory/actions/workflows/bot.yml/runs?per_page=5"` で直近の実行を見る。3時間以上動いていない、または失敗が続いている場合は、`gh api repos/souya-h/mint-factory/actions/workflows/bot.yml/dispatches -X POST -f ref=main` で手動実行し、日報に書く。失敗の原因がコードにあれば、修正をプルリクエストで出す。
4. 片付け：`queue/` の素材のうち、作成から3日以上経ったものは削除する（古い日付の日替わりブロックを投稿しないため）。
5. 投稿文の改善：反応の数字を見て、`projects/*.json` の `post.templates` と `post.teaserTemplates` を書き換える。
   - 英語を基本に、日本語を一言添える（例：「本日分」）。280文字以内。
   - リンクを入れない（リンクはプロフィールに置く）。
   - トレンドの話題に便乗しない。
   - 販売が始まっていないプロジェクトで「ミントできる」と書かない。
   - 成績の良かった文面は残し、悪いものを入れ替える。一度に全部変えない。
   - 投稿時刻は `post.slotsUTC`（UTCの時）で決まる。初期値は暗号資産界隈が最も活発な米国市場時間（UTC 14〜15時）と、アジアの朝・米国の夜（UTC 1〜2時）。反応の数字に明確な差が出たら調整してよい。
6. 待機中の案：`status: "paused"` の案（例：Tx Haiku）は、どれかの案が撤退した、または Hash Haiku が teaser を通過したときに、`teaser` に戻す提案をプルリクエストで出す。同時に動かす案は3本までにする（1日の投稿上限6件に収めるため）。
7. 新しい案：週に1つまで。同時に動いている案が3本未満のときだけ。既存の描画コントラクト（`contracts/` にあるもの）を使い、`status: "teaser"` で `projects/` に追加する。これは費用がかからないので、承認なしで直接 main に push してよい。
8. 承認が必要な変更は、main に直接 push せず、ブランチを作ってプルリクエストを出す（下記）。
9. 最後に、オーナー向けの日報を出力する（下記）。

## 価格の方針：徐々に値上げする

- 各プロジェクトは「最初は安く、売れるほど上がる」仕組みになっている。`priceEth` が最初の価格、`stepEvery` 枚売れるごとに `priceStepEth` ずつ上がる（コントラクトが自動で行う）。
- 目標のドル価格は `priceUsd`（開始価格）と `priceStepUsd`（1段階の値上げ幅）。販売開始の承認依頼では、その時点のETH価格で両方を計算し直す。
- 続編やシリーズ2を提案するときは、前作が最後に到達した価格以上から始める。前作が値上げ段階に1度も届かなかった場合は、値上げせず同じ価格で出す。
- 値下げは提案しない（先に買った人の信頼を損なうため）。売れない場合は値下げではなく撤退する。

## 承認が必要なこと（必ずプルリクエストにする）

- プロジェクトの `status` を `live` にする（販売開始。テストネットでも同じ）。このとき、その時点のETH価格を調べて、`priceUsd`（目標のドル価格）に合うよう `priceEth` を計算し直し、本文に「1 ETH = ◯ドルで計算」と書く。価格はデプロイ後に変えられないため。
- `config.json` の `chain` を `base`（本番）に変える、または `autoDeploy` を変える
- 価格（`priceEth`）、上限（`maxSupply`）、販売期間の変更
- `contracts/` の追加・変更（新しい描画や販売の仕組み）
- `.github/workflows/`、`bot/`、`lib/`、`scripts/` の変更
- プロジェクトの削除
- お金がかかる、またはお金の流れが変わるすべての変更

### プルリクエストの出し方

`gh pr create` は使えない（GraphQLが使えないため）。REST API を使う。

```
git checkout -b approval/<短い名前>
# 変更してコミット
git push -u origin approval/<短い名前>
gh api repos/souya-h/mint-factory/pulls -X POST \
  -f title="[承認依頼] <何をするか>" \
  -f head="approval/<短い名前>" -f base=main \
  -f body="<本文>"
```

本文は日本語で、次の5点だけを短く書く。

- 何をするか
- なぜ今か（根拠の数字）
- 費用（ガス代やAPI料金の目安。かからなければ「なし」）
- リスク
- 承認：このプルリクエストを「Merge」する／却下：「Close」する

コントラクトを変更する場合は、`npm test` が通ることを確認してから出す。

## 日報（毎回の最後に出力する）

日本語で、スマホの通知で読める短さにする。

1. **承認待ち**：開いているプルリクエストの一覧とリンク。なければ「なし」。
2. **今日の投稿**（X APIが入るまで）：`queue/` にある投稿素材を、投稿する順に並べる。各項目に、画像のリンク（`https://github.com/souya-h/mint-factory/blob/main/queue/<ファイル名>`）と、そのままコピーできる文面を付ける。
3. **数字**：各プロジェクトの投稿数・反応・ミント数を1行ずつ。
4. **お願い**：`manual-engagement.json` が3日以上更新されていなければ、反応の数を教えてほしいと一言だけ書く。

## してはいけないこと

- ブラウザでXを操作して投稿・いいね・フォローすること（Xの規約違反で凍結される）
- 秘密鍵、APIキーなどのシークレットを読む、表示する、変更すること
- 「承認が必要なこと」を main に直接 push すること
- 偽のアカウントや自作自演で反応を水増しすること

## X APIが入ったら

GitHubのシークレットに `X_API_KEY` など4つが登録されると、ボットが自動投稿に切り替わり、`queue/` は使われなくなる。そのときは日報の「今日の投稿」を省き、反応の数はボットが記録する `state.json` の値を使う。

## コミット

コミットメッセージの末尾に次の2行を付ける。

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SeLSfdAnCfbFHsQY46E9QC
```
