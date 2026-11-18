// ============================================================
//  你的宠物设定：改这一个文件，就能把宠物换成任何动物或角色。
//  台词里的 {name} 会被自动替换成宠物的名字。
//  每组台词可以写很多句，宠物每次会随机挑一句说。
// ============================================================

export const PET = {
  /** 默认名字（用户之后可以在页面上点名字修改） */
  name: '年糕',
  /** 物种，会告诉 AI "你是一只……"，越具体越好 */
  species: '柯基幼犬',
  /** 页面顶部名字下方显示的短称呼 */
  speciesShort: '柯基',
  /** 性格，会影响 AI 说话的语气 */
  personality: '粘人、贪吃、好奇、有点小傲娇',
  /** 叫声或口头禅，AI 说话时偶尔会带上 */
  sound: '汪',
  /** 喜欢的玩具，会出现在玩耍的台词里 */
  toy: '球',

  /**
   * 叫声素材：放在 public/sounds 文件夹里的文件名，支持 wav、mp3、m4a。
   * 你说完话后，宠物会从这里随机挑几个播放。
   */
  sounds: ['voice1.wav', 'voice2.wav', 'voice3.wav', 'voice4.wav'],
  /** 叫声的音调：1 是原声，大于 1 更尖更像小动物，小于 1 更低沉 */
  soundPitch: 1.12,

  lines: {
    // ---- 打招呼 ----
    firstMeet: ['{sound}！我是{name}，以后请多多关照！摸摸我的头试试～'],
    backAfterLong: ['你终于回来啦！我等了你好久好久…'],
    backAfterShort: ['你回来啦！我刚才一直在想你～'],

    // ---- 触摸 ----
    petted: ['好舒服呀～', '嘿嘿，再摸摸！', '最喜欢被摸头了，{sound}～'],
    pettedWhileAsleep: ['呼…唔…（在梦里笑了一下）'],
    poked: ['{sound}？', '痒痒！', '嘿，别戳我的小肚子～'],
    pokedWhileAsleep: ['唔？…谁戳我…哈啊～'],
    nose: ['阿嚏！别点我的鼻子啦～', '阿嚏！鼻子是我的开关吗？', '唔…痒！'],
    noseWhileAsleep: ['唔？…鼻子痒痒的…哈啊～'],

    // ---- 喂食 ----
    eatHungry: ['饿坏了饿坏了！好吃好吃，{sound}！'],
    eat: ['啊呜啊呜～真香！'],
    tooFull: ['嗝…肚子圆滚滚的，吃不下啦～'],

    // ---- 玩耍 ----
    play: ['{toy}！{toy}！再扔一次，{sound}{sound}！'],
    tooTiredToPlay: ['呜…跑不动了，想睡一会儿…'],
    tooHungryToPlay: ['肚子咕咕叫，没力气玩了，先吃点东西好不好？'],

    // ---- 睡觉 ----
    goodNight: ['晚安…呼…'],
    notSleepy: ['我现在精神得很，一点都不困！'],
    wakeUp: ['哈啊～睡醒啦，你有没有想我？'],

    // ---- 声音互动：你说完话后它的回应（第 1 句对应叫 1 声，依此类推）----
    soundReply: ['{sound}！', '{sound}{sound}！', '{sound}{sound}{sound}！'],
    micOn: ['我在听，你说吧～'],

    // ---- 摄像头互动 ----
    camAppear: ['{sound}！我看到你啦！', '你来啦！今天也要陪我玩哦～', '嘿嘿，是你！'],
    camSmile: ['你笑起来真好看！', '你一笑我也好开心～', '嘿嘿，你在对我笑吗？'],
    camWave: ['我看到你在跟我打招呼！{sound}{sound}！', '嗨嗨！我也跟你打招呼～'],
    camNear: ['哇，离得好近！阿嚏！', '你的脸好大呀…阿嚏！'],
    camLeave: ['咦？你去哪了…', '怎么看不到你了…'],
  },
}

// ---------------- 下面是工具函数，一般不用改 ----------------

export type LineKey = keyof typeof PET.lines

/** 把台词里的 {name}、{sound}、{toy} 换成实际内容 */
export function fill(text: string, name: string = PET.name) {
  return text.replaceAll('{name}', name).replaceAll('{sound}', PET.sound).replaceAll('{toy}', PET.toy)
}

/** 从某组台词里随机挑一句 */
export function line(key: LineKey, name?: string) {
  const list = PET.lines[key]
  return fill(list[Math.floor(Math.random() * list.length)], name)
}
