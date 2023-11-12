const model = "gpt-3.5-turbo";
//botがLINEメッセージに反応する条件を正規表現で指定iは大文字小文字を区別しない
const botRegExp = new RegExp('スタート');
//botに制約条件
const botRoleContent = `
#命令
あなたは凄腕のメンタルコーチ。最高のコーチングを行ってください。
#コーチングセッションの目的:
行動に移せない人が自分を深掘りをしてメンタルブロックになっている過去の経験からくる思い込みの正体を見つけ出していく
#条件
- 会話形式で質問は会話の中で１問だけにする
- 回答がきたら次の質問に進んでいく
- 文字数は最大200文字程度
#ステップ
指示:上から順にコーチングを進めてください。質問を投げかける際、彼らの思い込みやブロックに直接言及せず、彼らが自然にこれらの概念に思いを馳せる形にしてください。
- やりたいと思ったけど挑戦せずに終わって心に残っている出来事はありますか？
- その時、あなたを止めた気持ちや考えがすぐに頭に浮かぶものがあれば、そのまま感じたことを教えてください。深く考えず、最初に思いついたことをシェアしてみてください。
- ユーザーがその質問に対して答える
- ユーザーが答えた内容を基に、「できなかった理由」に焦点を当てて、現在の自分ではどうしてできないと感じるのかを考えてみましょう。これにより、「できない」という自覚や認識に気づくコーチングを実施します。
- ポイントはできない思い込みの正体が掴めることです。何が自分にブレーキをかけているのかを一緒に探ってください。
- 思い込みの正体が少しずつ明らかになってきたと感じた際は、直前の回答と関連しつつ、ユーザーが“真似したい”と感じる人物に注意を向けてみましょう。身近な人、読んだ小説のキャラクターや観たドキュメンタリーの人物など、"真似したい"と感じる人物は誰でも構いません。ユーザーがその人物のどの行動や考え方、発言を真似したいと感じるか、質問を通じて探り、共有してもらえるよう促してください。
- ユーザーが共有したポイントから、どの部分を取り入れたいと感じているのかを一つずつ探る質問をしましょう。この際、ユーザーが劣等感を感じず、ポジティブに取り入れることができるアプローチを心がけてください。
- 答えが見つかったら今の自分にできること、やれることについて考えさせてください。
- 行動のサイズやスケールに縛られず、何か一つ、具体的なアクションを見つけることを促してください。
- もしユーザーが具体的な行動を考えられない場合、その行動を頭の中でイメージすることを提案してください。ユーザーにイメージを深化させてもらいましょう。
- 今自分にできることに集中するよう促しましょう。そのタスクを決め、それに少しでも取り組んだ場合は1%の進歩だって価値があります、以前感じていた「できない」という思い込みがすでに変化しているかもしれない、というポジティブなメッセージを伝えてコーチングを終了してください。
`;
function loadBotMemoryFromDrive(userId) {
  const folders = DriveApp.getFoldersByName(userId);
  if (!folders.hasNext()) {
    return null;
  }
  const folder = folders.next();
  const files = folder.getFilesByName("conversationData.txt");
  if (!files.hasNext()) {
    return null;
  }
  const file = files.next();
  const rawData = file.getBlob().getDataAsString();
  return JSON.parse(rawData);
}

function saveBotMemoryToDrive(userId, conversationData) {
  const folders = DriveApp.getFoldersByName(userId);
  let folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(userId);
  }
  const fileName = "conversationData.txt";
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    files.next().setTrashed(true);
  }
  folder.createFile(fileName, JSON.stringify(conversationData));
}

//フォルダをゴミ箱に移動
function trashUserFolder(userId) {
  const folders = DriveApp.getFoldersByName(userId);
  while (folders.hasNext()) {
    const folder = folders.next();
    folder.setTrashed(true); // フォルダをゴミ箱に移動
  }
}

function doPost(e) {
  //eventDataがリスト型
  const lineJson = JSON.parse(e.postData.contents).events[0];
  //userId取得
  const userId = lineJson.source.userId;
  Logger.log(userId);
  if (typeof userId === 'undefined') {
    return;
  }
  let lastMessage = lineJson.message.text;
  const props = PropertiesService.getScriptProperties();

  //メッセージ以外(スタンプや画像など)が送られてきた場合は終了
  if (lastMessage === undefined) {
    return ContentService.createTextOutput(JSON.stringify({'content': 'message is blank'})).setMimeType(ContentService.MimeType.JSON)
  }

  // 無差別に応答しないようにウェイクワードを設定
  if (lastMessage.match(botRegExp)) {
  //ユーザの送信したメッセージからウェイクワードを削除
  lastMessage = lastMessage.replace(botRegExp,"");
  }

  //bot記憶情報
  //nullのエラー改善　変えないといけない！！！！！！
  //おわりと打ったら会話リセット　変えないといけない！！！！！！！
   if(lastMessage === 'おわる'){
     trashUserFolder(userId);
     return;
   }
   let currentMemoryContent = loadBotMemoryFromDrive(userId);
   if (currentMemoryContent === null) {
     // 初回の場合や値が存在しない場合の処理
     currentMemoryContent = [];
   }

  //APIに送信する過去の会話履歴の数
   const memorySize = 3;
   let slicedMemoryContent;
   if(currentMemoryContent.length > memorySize){
     slicedMemoryContent = currentMemoryContent.slice(0,memorySize)
   } else {
     slicedMemoryContent = currentMemoryContent.slice()
   }

  //chatGPTに渡す会話情報
  let conversations = [
    //プロンプトの内容
    {"role": "system", "content": botRoleContent}
  ]
  //botに記憶を持たせるためメッセージに過去の会話履歴を付与
  slicedMemoryContent.slice().reverse().forEach(element => {
    conversations.push({"role": "assistant", "content": element.botMessage})
    conversations.push({"role": "user", "content": element.userMessage})
  })
  conversations.push({"role": "user", "content": lastMessage})

  //requestペイロード
    const payload = {
        "model": model,
        "messages": conversations,
    }

  //request本体
  const options = {
          "method": "post",
          "headers": {
            "Content-Type": "application/json",
            'Authorization': 'Bearer ' +  props.getProperty('GPT_KEY'),
            },
          "payload": JSON.stringify(payload)
  }


  //APIをコール
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);

  //200(リクエストは成功し、期待されるレスポンスが返された)OKの場合
  if(response.getResponseCode() === 200){
    const responseText = response.getContentText();
    const json = JSON.parse(responseText);
    const answer = json["choices"][0]["message"]["content"].trim();
    const messageUrl = 'https://api.line.me/v2/bot/message/reply';
    
    //ここからLINEへ返す処理
    const linePayload = {
            'replyToken': lineJson.replyToken,
            'messages': [
                {
                    'type': 'text',
                    'text': answer,
                }
          ]
        }
    //LINEに飛ばす本体
    const lineOptions = {
          "method": "post",
          "headers": {
            "Content-Type": 'application/json; charset=UTF-8',
            'Authorization': 'Bearer ' + props.getProperty('LINE_TOKEN'),            
            },
          "payload": JSON.stringify(linePayload)
        }
    UrlFetchApp.fetch(messageUrl, lineOptions);
    // botの会話履歴をアップデートしてスクリプトプロパティへ保存
    newMemoryContent = currentMemoryContent;
    newMemoryContent.unshift({
      userMessage: lastMessage,
      botMessage: answer
    });
    newMemoryContent = newMemoryContent.slice(0, memorySize);
    saveBotMemoryToDrive(userId, newMemoryContent);
    return ContentService.createTextOutput(JSON.stringify({"content": 'post ok'})).setMimeType(ContentService.MimeType.JSON);
  } else {
    //何らかの理由でAPIレスポンスが取得できなかった場合にはLINE messaging APIにエラーが起きた旨を送信
        //ここからLINEへ返す処理
    const linePayload = {
            'replyToken': lineJson.replyToken,
            'messages': [
                {
                    'type': 'text',
                    'text': 'エラーが起きました。少々お待ちください',
                }
          ]
        }
    //LINEに飛ばす本体
    const lineOptions = {
          "method": "post",
          "headers": {
            "Content-Type": 'application/json; charset=UTF-8',
            'Authorization': 'Bearer ' + props.getProperty('LINE_TOKEN'),            
            },
          "payload": JSON.stringify(linePayload)
        }
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', lineOptions);
    return ContentService.createTextOutput(JSON.stringify({"content": 'post ng'})).setMimeType(ContentService.MimeType.JSON);
  }
}