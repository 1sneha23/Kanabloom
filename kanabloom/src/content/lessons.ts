// Source content for greetings, self-introduction and business lessons, and seeded quizzes.
// Input to scripts/gen-seed.ts. Kana, romaji and English only — no Kanji.

export interface Line { speaker?: string; jp: string; romaji: string; en: string }
export interface PhraseItem {
  jp: string; romaji: string; en: string;
  pronunciation?: string;
  usage?: string;
  example?: Line;
  conversation?: Line[];
}
export interface LessonSeed {
  slug: string;
  module: 'greetings' | 'self_intro' | 'business' | 'writing';
  title: string;
  summary: string;
  sort_order: number;
  content: { intro: string; items: PhraseItem[]; builder?: SentenceBuilder[] };
}
export interface SentenceBuilder { prompt: string; tiles: string[]; answer: string[]; romaji: string; en: string }
export interface QuizQuestion { prompt: string; choices: string[]; answer: number; explanation?: string }
export interface QuizSeed { slug: string; module: string; lesson_slug?: string; title: string; questions: QuizQuestion[] }

export const LESSONS: LessonSeed[] = [
  {
    slug: 'basic-greetings', module: 'greetings', sort_order: 1,
    title: 'Everyday Greetings', summary: 'Ten expressions you will hear every single day in Japan.',
    content: {
      intro: 'Greetings change with the time of day and how polite you need to be. Start with these ten and you can open and close almost any conversation.',
      items: [
        { jp: 'おはようございます', romaji: 'ohayou gozaimasu', en: 'Good morning.', pronunciation: 'oh-ha-yoh go-zai-mas (the final u is almost silent)',
          usage: 'Polite morning greeting, used until about 10–11am. With friends, just おはよう.',
          example: { jp: 'せんせい、おはようございます。', romaji: 'Sensei, ohayou gozaimasu.', en: 'Good morning, teacher.' },
          conversation: [
            { speaker: 'A', jp: 'おはようございます。', romaji: 'Ohayou gozaimasu.', en: 'Good morning.' },
            { speaker: 'B', jp: 'おはようございます。いい てんき ですね。', romaji: 'Ohayou gozaimasu. Ii tenki desu ne.', en: 'Good morning. Nice weather, isn\'t it?' },
          ] },
        { jp: 'こんにちは', romaji: 'konnichiwa', en: 'Hello / Good afternoon.', pronunciation: 'kon-nee-chee-wa (written は, read "wa")',
          usage: 'General daytime greeting. Not normally used with family or close colleagues you see every day.',
          example: { jp: 'こんにちは、たなかさん。', romaji: 'Konnichiwa, Tanaka-san.', en: 'Hello, Mr/Ms Tanaka.' },
          conversation: [
            { speaker: 'A', jp: 'こんにちは。', romaji: 'Konnichiwa.', en: 'Hello.' },
            { speaker: 'B', jp: 'あ、こんにちは。', romaji: 'A, konnichiwa.', en: 'Oh, hello.' },
          ] },
        { jp: 'こんばんは', romaji: 'konbanwa', en: 'Good evening.', pronunciation: 'kon-ban-wa',
          usage: 'Used after dark when meeting someone.',
          example: { jp: 'みなさん、こんばんは。', romaji: 'Minasan, konbanwa.', en: 'Good evening, everyone.' },
          conversation: [
            { speaker: 'A', jp: 'こんばんは。', romaji: 'Konbanwa.', en: 'Good evening.' },
            { speaker: 'B', jp: 'こんばんは。さむい ですね。', romaji: 'Konbanwa. Samui desu ne.', en: 'Good evening. It\'s cold, isn\'t it?' },
          ] },
        { jp: 'ありがとうございます', romaji: 'arigatou gozaimasu', en: 'Thank you.', pronunciation: 'ah-ree-ga-toh go-zai-mas',
          usage: 'Polite thanks. Casual version: ありがとう.',
          example: { jp: 'てつだって くれて、ありがとうございます。', romaji: 'Tetsudatte kurete, arigatou gozaimasu.', en: 'Thank you for helping me.' },
          conversation: [
            { speaker: 'A', jp: 'これ、どうぞ。', romaji: 'Kore, douzo.', en: 'Here you are.' },
            { speaker: 'B', jp: 'ありがとうございます。', romaji: 'Arigatou gozaimasu.', en: 'Thank you.' },
          ] },
        { jp: 'すみません', romaji: 'sumimasen', en: 'Excuse me / Sorry.', pronunciation: 'soo-mee-ma-sen',
          usage: 'Gets attention, apologises for small things, and can even mean "thanks for the trouble".',
          example: { jp: 'すみません、えきは どこ ですか。', romaji: 'Sumimasen, eki wa doko desu ka.', en: 'Excuse me, where is the station?' },
          conversation: [
            { speaker: 'A', jp: 'すみません。', romaji: 'Sumimasen.', en: 'Excuse me.' },
            { speaker: 'B', jp: 'はい、なん ですか。', romaji: 'Hai, nan desu ka.', en: 'Yes, what is it?' },
          ] },
        { jp: 'はい', romaji: 'hai', en: 'Yes.', pronunciation: 'hi',
          usage: 'Also means "I\'m listening" or "understood", not always agreement.',
          example: { jp: 'はい、そうです。', romaji: 'Hai, sou desu.', en: 'Yes, that\'s right.' },
          conversation: [
            { speaker: 'A', jp: 'がくせい ですか。', romaji: 'Gakusei desu ka.', en: 'Are you a student?' },
            { speaker: 'B', jp: 'はい、がくせい です。', romaji: 'Hai, gakusei desu.', en: 'Yes, I am a student.' },
          ] },
        { jp: 'いいえ', romaji: 'iie', en: 'No.', pronunciation: 'ee-eh',
          usage: 'A direct "no". Also a modest reply to thanks: "not at all".',
          example: { jp: 'いいえ、ちがいます。', romaji: 'Iie, chigaimasu.', en: 'No, that\'s not right.' },
          conversation: [
            { speaker: 'A', jp: 'せんせい ですか。', romaji: 'Sensei desu ka.', en: 'Are you a teacher?' },
            { speaker: 'B', jp: 'いいえ、がくせい です。', romaji: 'Iie, gakusei desu.', en: 'No, I am a student.' },
          ] },
        { jp: 'さようなら', romaji: 'sayounara', en: 'Goodbye.', pronunciation: 'sa-yoh-na-ra',
          usage: 'Fairly final goodbye. Between friends, じゃあね or またね is more common.',
          example: { jp: 'みなさん、さようなら。', romaji: 'Minasan, sayounara.', en: 'Goodbye, everyone.' },
          conversation: [
            { speaker: 'A', jp: 'さようなら。', romaji: 'Sayounara.', en: 'Goodbye.' },
            { speaker: 'B', jp: 'さようなら。また あした。', romaji: 'Sayounara. Mata ashita.', en: 'Goodbye. See you tomorrow.' },
          ] },
        { jp: 'おやすみなさい', romaji: 'oyasuminasai', en: 'Good night.', pronunciation: 'oh-ya-soo-mee-na-sai',
          usage: 'Said before going to bed or when parting late at night. Casual: おやすみ.',
          example: { jp: 'おかあさん、おやすみなさい。', romaji: 'Okaasan, oyasuminasai.', en: 'Good night, Mum.' },
          conversation: [
            { speaker: 'A', jp: 'そろそろ ねます。', romaji: 'Sorosoro nemasu.', en: 'I\'m going to bed soon.' },
            { speaker: 'B', jp: 'おやすみなさい。', romaji: 'Oyasuminasai.', en: 'Good night.' },
          ] },
        { jp: 'はじめまして', romaji: 'hajimemashite', en: 'Nice to meet you.', pronunciation: 'ha-jee-meh-mash-teh',
          usage: 'Only the first time you meet someone. Usually followed by your name.',
          example: { jp: 'はじめまして、リサ です。', romaji: 'Hajimemashite, Risa desu.', en: 'Nice to meet you, I\'m Lisa.' },
          conversation: [
            { speaker: 'A', jp: 'はじめまして。ケン です。', romaji: 'Hajimemashite. Ken desu.', en: 'Nice to meet you. I\'m Ken.' },
            { speaker: 'B', jp: 'はじめまして。アナ です。', romaji: 'Hajimemashite. Ana desu.', en: 'Nice to meet you. I\'m Ana.' },
          ] },
      ],
    },
  },
  {
    slug: 'self-introduction', module: 'self_intro', sort_order: 1,
    title: 'Introduce Yourself', summary: 'Say your name, where you are from, what you do and what you enjoy.',
    content: {
      intro: 'A Japanese self-introduction (じこしょうかい) follows a set shape: greeting, name, details about you, and a polite closing. Swap in your own words for the parts in brackets.',
      items: [
        { jp: 'はじめまして。', romaji: 'Hajimemashite.', en: 'Nice to meet you.', usage: 'Greeting — always first.' },
        { jp: 'わたしは [name] です。', romaji: 'Watashi wa [name] desu.', en: 'I am [name].', usage: 'Name. は is read "wa" here. Use katakana for non-Japanese names, e.g. サラ (Sara).' },
        { jp: 'わたしは インドじん です。', romaji: 'Watashi wa Indo-jin desu.', en: 'I am Indian.', usage: 'Nationality: country + じん. アメリカじん (American), イギリスじん (British), にほんじん (Japanese).' },
        { jp: 'わたしは エンジニア です。', romaji: 'Watashi wa enjinia desu.', en: 'I am an engineer.', usage: 'Occupation. Others: かいしゃいん (company employee), せんせい (teacher), いしゃ (doctor).' },
        { jp: 'わたしは がくせい です。', romaji: 'Watashi wa gakusei desu.', en: 'I am a student.', usage: 'Student identity. だいがくせい = university student.' },
        { jp: 'しゅみは りょうり です。', romaji: 'Shumi wa ryouri desu.', en: 'My hobby is cooking.', usage: 'Hobbies. Try どくしょ (reading), りょこう (travel), サッカー (football), ヨガ (yoga).' },
        { jp: 'にほんの アニメが すき です。', romaji: 'Nihon no anime ga suki desu.', en: 'I like Japanese anime.', usage: 'Interests: [thing] が すき です = I like [thing].' },
        { jp: 'よろしく おねがいします。', romaji: 'Yoroshiku onegaishimasu.', en: 'I look forward to getting to know you.', usage: 'Polite closing — no exact English equivalent. Always end with this.' },
      ],
      builder: [
        { prompt: 'Build: "I am a student."', tiles: ['です', 'わたしは', 'がくせい'], answer: ['わたしは', 'がくせい', 'です'], romaji: 'Watashi wa gakusei desu.', en: 'I am a student.' },
        { prompt: 'Build: "I am Indian."', tiles: ['インドじん', 'です', 'わたしは'], answer: ['わたしは', 'インドじん', 'です'], romaji: 'Watashi wa Indo-jin desu.', en: 'I am Indian.' },
        { prompt: 'Build: "My hobby is travel."', tiles: ['りょこう', 'です', 'しゅみは'], answer: ['しゅみは', 'りょこう', 'です'], romaji: 'Shumi wa ryokou desu.', en: 'My hobby is travel.' },
        { prompt: 'Build the polite closing.', tiles: ['おねがいします', 'よろしく'], answer: ['よろしく', 'おねがいします'], romaji: 'Yoroshiku onegaishimasu.', en: 'I look forward to getting to know you.' },
      ],
    },
  },
  {
    slug: 'business-vocabulary', module: 'business', sort_order: 1,
    title: 'Business Vocabulary', summary: 'Nine essential workplace words, written in kana.',
    content: {
      intro: 'These words appear in almost every Japanese office. They are usually written in Kanji at work — here you learn the sound and kana spelling first.',
      items: [
        { jp: 'かいしゃ', romaji: 'kaisha', en: 'Company.', usage: 'Your workplace or any company.', example: { jp: 'わたしの かいしゃは とうきょうに あります。', romaji: 'Watashi no kaisha wa Toukyou ni arimasu.', en: 'My company is in Tokyo.' } },
        { jp: 'かいぎ', romaji: 'kaigi', en: 'Meeting.', usage: 'A formal meeting.', example: { jp: 'さんじに かいぎが あります。', romaji: 'Sanji ni kaigi ga arimasu.', en: 'There is a meeting at three o\'clock.' } },
        { jp: 'しゃいん', romaji: 'shain', en: 'Employee.', usage: 'A staff member of a company.', example: { jp: 'かれは この かいしゃの しゃいん です。', romaji: 'Kare wa kono kaisha no shain desu.', en: 'He is an employee of this company.' } },
        { jp: 'しゃちょう', romaji: 'shachou', en: 'Company president.', usage: 'The head of a company. Also used as a title: たなか しゃちょう.', example: { jp: 'しゃちょうは いま かいぎちゅう です。', romaji: 'Shachou wa ima kaigichuu desu.', en: 'The president is in a meeting now.' } },
        { jp: 'しごと', romaji: 'shigoto', en: 'Work.', usage: 'Work, a job, or a task.', example: { jp: 'しごとは たのしい です。', romaji: 'Shigoto wa tanoshii desu.', en: 'Work is fun.' } },
        { jp: 'でんわ', romaji: 'denwa', en: 'Telephone.', usage: 'Phone or phone call. でんわします = I will call.', example: { jp: 'あとで でんわします。', romaji: 'Atode denwa shimasu.', en: 'I will call you later.' } },
        { jp: 'めいし', romaji: 'meishi', en: 'Business card.', usage: 'Exchanged with both hands at first meetings.', example: { jp: 'こちらが わたしの めいし です。', romaji: 'Kochira ga watashi no meishi desu.', en: 'This is my business card.' } },
        { jp: 'おきゃくさま', romaji: 'okyakusama', en: 'Customer.', usage: 'Very polite word for a customer or guest.', example: { jp: 'おきゃくさまが いらっしゃいました。', romaji: 'Okyakusama ga irasshaimashita.', en: 'A customer has arrived.' } },
        { jp: 'しつもん', romaji: 'shitsumon', en: 'Question.', usage: 'しつもんが あります = I have a question.', example: { jp: 'しつもんが あります。', romaji: 'Shitsumon ga arimasu.', en: 'I have a question.' } },
      ],
    },
  },
  {
    slug: 'business-expressions', module: 'business', sort_order: 2,
    title: 'Business Expressions & Dialogue', summary: 'Polite phrases for the office and your first business-card exchange.',
    content: {
      intro: 'Workplace Japanese is more polite than everyday speech. These set phrases are safe to use with anyone at work.',
      items: [
        { jp: 'おつかれさまです', romaji: 'otsukaresama desu', en: 'Thanks for your hard work.', usage: 'Said to colleagues all day — when passing in the hall, starting a call, or leaving.' },
        { jp: 'おせわに なって おります', romaji: 'osewa ni natte orimasu', en: 'Thank you for your continued support.', usage: 'Standard opening for calls and emails with clients.' },
        { jp: 'しょうしょう おまち ください', romaji: 'shoushou omachi kudasai', en: 'Please wait a moment.', usage: 'Polite way to ask someone to hold.' },
        { jp: 'もうしわけ ございません', romaji: 'moushiwake gozaimasen', en: 'I am very sorry.', usage: 'Formal apology to a customer or superior.' },
        { jp: 'よろしく おねがいいたします', romaji: 'yoroshiku onegai itashimasu', en: 'I appreciate your help (very polite).', usage: 'Even more polite version of よろしく おねがいします.',
          conversation: [
            { speaker: 'A', jp: 'はじめまして。ABCしゃの スミス です。', romaji: 'Hajimemashite. ABC-sha no Sumisu desu.', en: 'Nice to meet you. I\'m Smith from ABC.' },
            { speaker: 'B', jp: 'はじめまして。やまだ です。こちら、わたしの めいし です。', romaji: 'Hajimemashite. Yamada desu. Kochira, watashi no meishi desu.', en: 'Nice to meet you. I\'m Yamada. Here is my business card.' },
            { speaker: 'A', jp: 'ちょうだい します。よろしく おねがいいたします。', romaji: 'Choudai shimasu. Yoroshiku onegai itashimasu.', en: 'Thank you, I gratefully accept it. I look forward to working with you.' },
          ] },
      ],
    },
  },
];

export const QUIZZES: QuizSeed[] = [
  {
    slug: 'greetings-quiz', module: 'greetings', lesson_slug: 'basic-greetings', title: 'Greetings Check',
    questions: [
      { prompt: 'It is 8am. You meet your teacher. What do you say?', choices: ['こんばんは', 'おはようございます', 'おやすみなさい', 'さようなら'], answer: 1 },
      { prompt: 'What does ありがとうございます mean?', choices: ['Excuse me', 'Good night', 'Thank you', 'Nice to meet you'], answer: 2 },
      { prompt: 'Which greeting is used in the evening?', choices: ['こんばんは', 'こんにちは', 'はじめまして', 'はい'], answer: 0 },
      { prompt: 'How do you get a waiter\'s attention politely?', choices: ['いいえ', 'すみません', 'おやすみなさい', 'さようなら'], answer: 1 },
      { prompt: 'What is the romaji for はじめまして?', choices: ['hajimemashite', 'hashimemasute', 'hajimaemashita', 'haimemashite'], answer: 0 },
      { prompt: 'What does いいえ mean?', choices: ['Yes', 'No', 'Hello', 'Sorry'], answer: 1 },
    ],
  },
  {
    slug: 'self-intro-quiz', module: 'self_intro', lesson_slug: 'self-introduction', title: 'Self-Introduction Check',
    questions: [
      { prompt: 'What does わたしは がくせい です mean?', choices: ['I am a teacher.', 'I am a student.', 'I am Japanese.', 'I like students.'], answer: 1 },
      { prompt: 'How is は read in わたしは?', choices: ['ha', 'wa', 'ho', 'ba'], answer: 1 },
      { prompt: 'How do you say "I am Indian"?', choices: ['わたしは インドじん です', 'わたしは インド です', 'インドは わたし です', 'わたしは にほんじん です'], answer: 0 },
      { prompt: 'Which phrase politely closes a self-introduction?', choices: ['さようなら', 'すみません', 'よろしく おねがいします', 'おはようございます'], answer: 2 },
      { prompt: 'しゅみは りょうり です means…', choices: ['My hobby is cooking.', 'My job is cooking.', 'I am a cook.', 'I like restaurants.'], answer: 0 },
    ],
  },
  {
    slug: 'business-quiz', module: 'business', lesson_slug: 'business-vocabulary', title: 'Business Vocabulary Check',
    questions: [
      { prompt: 'What is かいぎ?', choices: ['Company', 'Meeting', 'Telephone', 'Question'], answer: 1 },
      { prompt: 'Which word means "business card"?', choices: ['めいし', 'しごと', 'でんわ', 'しゃいん'], answer: 0 },
      { prompt: 'What is the romaji for しゃちょう?', choices: ['shachou', 'shacho', 'shachiyou', 'sachou'], answer: 0 },
      { prompt: 'おきゃくさま means…', choices: ['Employee', 'Customer', 'President', 'Colleague'], answer: 1 },
      { prompt: 'How do you say "I have a question"?', choices: ['しつもんが あります', 'しごとが あります', 'でんわが あります', 'かいしゃが あります'], answer: 0 },
      { prompt: 'Which phrase do you say to colleagues when leaving?', choices: ['おつかれさまです', 'はじめまして', 'こんばんは', 'いいえ'], answer: 0 },
    ],
  },
];
