import type { Level } from "@/lib/types";

export type SeedVocab = {
  word: string;
  uzbek: string;
  russian: string;
  example: string;
  pronunciation: string;
  category: string;
  level: Level;
};

export const VOCABULARY: SeedVocab[] = [
  { word: "brave", uzbek: "jasur", russian: "смелый", example: "The brave firefighter saved the child.", pronunciation: "/breɪv/", category: "Personality", level: "BEGINNER" },
  { word: "journey", uzbek: "sayohat", russian: "путешествие", example: "The journey to the mountains took three hours.", pronunciation: "/ˈdʒɜːrni/", category: "Travel", level: "BEGINNER" },
  { word: "improve", uzbek: "yaxshilash", russian: "улучшать", example: "Reading every day will improve your English.", pronunciation: "/ɪmˈpruːv/", category: "Work & Study", level: "ELEMENTARY" },
  { word: "knowledge", uzbek: "bilim", russian: "знание", example: "Knowledge is power.", pronunciation: "/ˈnɒlɪdʒ/", category: "Work & Study", level: "ELEMENTARY" },
  { word: "opportunity", uzbek: "imkoniyat", russian: "возможность", example: "This job is a great opportunity for you.", pronunciation: "/ˌɒpəˈtjuːnəti/", category: "Work & Study", level: "PRE_INTERMEDIATE" },
  { word: "decision", uzbek: "qaror", russian: "решение", example: "She made a difficult decision.", pronunciation: "/dɪˈsɪʒn/", category: "Emotions", level: "ELEMENTARY" },
  { word: "weather", uzbek: "ob-havo", russian: "погода", example: "The weather is sunny and warm today.", pronunciation: "/ˈweðə/", category: "Daily Life", level: "BEGINNER" },
  { word: "healthy", uzbek: "sog'lom", russian: "здоровый", example: "Eating vegetables keeps you healthy.", pronunciation: "/ˈhelθi/", category: "Health", level: "BEGINNER" },
  { word: "borrow", uzbek: "qarzga olish", russian: "одалживать", example: "Can I borrow your pen for a minute?", pronunciation: "/ˈbɒrəʊ/", category: "Daily Life", level: "ELEMENTARY" },
  { word: "announce", uzbek: "e'lon qilish", russian: "объявлять", example: "They will announce the results tomorrow.", pronunciation: "/əˈnaʊns/", category: "Work & Study", level: "PRE_INTERMEDIATE" },
  { word: "crowded", uzbek: "gavjum", russian: "многолюдный", example: "The bus was crowded this morning.", pronunciation: "/ˈkraʊdɪd/", category: "Travel", level: "ELEMENTARY" },
  { word: "efficient", uzbek: "samarali", russian: "эффективный", example: "This is a very efficient method.", pronunciation: "/ɪˈfɪʃnt/", category: "Work & Study", level: "INTERMEDIATE" },
  { word: "anxious", uzbek: "xavotirli", russian: "тревожный", example: "He felt anxious before the exam.", pronunciation: "/ˈæŋkʃəs/", category: "Emotions", level: "INTERMEDIATE" },
  { word: "generous", uzbek: "saxiy", russian: "щедрый", example: "My uncle is generous with his time.", pronunciation: "/ˈdʒenərəs/", category: "Personality", level: "PRE_INTERMEDIATE" },
  { word: "schedule", uzbek: "jadval", russian: "расписание", example: "My schedule is full on Monday.", pronunciation: "/ˈʃedjuːl/", category: "Work & Study", level: "ELEMENTARY" },
  { word: "delicious", uzbek: "mazali", russian: "вкусный", example: "The soup was absolutely delicious.", pronunciation: "/dɪˈlɪʃəs/", category: "Food", level: "BEGINNER" },
  { word: "environment", uzbek: "atrof-muhit", russian: "окружающая среда", example: "We must protect the environment.", pronunciation: "/ɪnˈvaɪrənmənt/", category: "Nature", level: "PRE_INTERMEDIATE" },
  { word: "responsible", uzbek: "javobgar", russian: "ответственный", example: "You are responsible for your own choices.", pronunciation: "/rɪˈspɒnsəbl/", category: "Personality", level: "PRE_INTERMEDIATE" },
  { word: "achieve", uzbek: "erishish", russian: "достигать", example: "She achieved her goal after two years.", pronunciation: "/əˈtʃiːv/", category: "Work & Study", level: "ELEMENTARY" },
  { word: "available", uzbek: "mavjud", russian: "доступный", example: "Tickets are available online.", pronunciation: "/əˈveɪləbl/", category: "Daily Life", level: "ELEMENTARY" },
  { word: "recommend", uzbek: "tavsiya qilish", russian: "рекомендовать", example: "I recommend this book to everyone.", pronunciation: "/ˌrekəˈmend/", category: "Daily Life", level: "ELEMENTARY" },
  { word: "experience", uzbek: "tajriba", russian: "опыт", example: "She has ten years of experience.", pronunciation: "/ɪkˈspɪəriəns/", category: "Work & Study", level: "PRE_INTERMEDIATE" },
  { word: "attention", uzbek: "e'tibor", russian: "внимание", example: "Please pay attention to the teacher.", pronunciation: "/əˈtenʃn/", category: "Work & Study", level: "ELEMENTARY" },
  { word: "comfortable", uzbek: "qulay", russian: "удобный", example: "These chairs are very comfortable.", pronunciation: "/ˈkʌmftəbl/", category: "Daily Life", level: "BEGINNER" },
  { word: "foreign", uzbek: "chet el", russian: "иностранний", example: "He speaks three foreign languages.", pronunciation: "/ˈfɒrən/", category: "Travel", level: "ELEMENTARY" },
  { word: "interrupt", uzbek: "tarqalmoq / bo'lmoq", russian: "прерывать", example: "Sorry to interrupt, but we are late.", pronunciation: "/ˌɪntəˈrʌpt/", category: "Daily Life", level: "INTERMEDIATE" },
  { word: "curious", uzbek: "qiziquvchan", russian: "любопытный", example: "The curious student asked many questions.", pronunciation: "/ˈkjʊəriəs/", category: "Personality", level: "PRE_INTERMEDIATE" },
  { word: "gradually", uzbek: "bosqichma-bosqich", russian: "постепенно", example: "The weather gradually became colder.", pronunciation: "/ˈɡrædʒuəli/", category: "Daily Life", level: "INTERMEDIATE" },
  { word: "avoid", uzbek: "saqlanish", russian: "избегать", example: "Try to avoid sugary drinks.", pronunciation: "/əˈvɔɪd/", category: "Health", level: "PRE_INTERMEDIATE" },
  { word: "confident", uzbek: "ishonchli", russian: "уверенный", example: "Be confident in your answers.", pronunciation: "/ˈkɒnfɪdənt/", category: "Personality", level: "ELEMENTARY" },
  { word: "deadline", uzbek: "muddat", russian: "срок сдачи", example: "The deadline is Friday at noon.", pronunciation: "/ˈdedlaɪn/", category: "Work & Study", level: "INTERMEDIATE" },
  { word: "appreciate", uzbek: "qadrlash", russian: "ценить", example: "I appreciate your help with the project.", pronunciation: "/əˈpriːʃieɪt/", category: "Emotions", level: "INTERMEDIATE" },
  { word: "neighbor", uzbek: "qo'shni", russian: "сосед", example: "Our neighbor has a friendly dog.", pronunciation: "/ˈneɪbə/", category: "Daily Life", level: "BEGINNER" },
  { word: "schedule", uzbek: "rejalashtirish", russian: "планировать", example: "I schedule my lessons every Sunday.", pronunciation: "/ˈʃedjuːl/", category: "Work & Study", level: "ELEMENTARY" },
  { word: "temporary", uzbek: "vaqtinchalik", russian: "временный", example: "This is only a temporary job.", pronunciation: "/ˈtemprəri/", category: "Work & Study", level: "INTERMEDIATE" },
  { word: "wonderful", uzbek: "ajoyib", russian: "замечательный", example: "We had a wonderful evening.", pronunciation: "/ˈwʌndəfl/", category: "Emotions", level: "BEGINNER" },
  { word: "reliable", uzbek: "ishonchli", russian: "надёжный", example: "He is a reliable colleague.", pronunciation: "/rɪˈlaɪəbl/", category: "Personality", level: "PRE_INTERMEDIATE" },
  { word: "expense", uzbek: "xarajat", russian: "расход", example: "Travel is a big expense for the company.", pronunciation: "/ɪkˈspens/", category: "Work & Study", level: "INTERMEDIATE" },
  { word: "gather", uzbek: "yig'ilish", russian: "собираться", example: "The family gathers every Friday.", pronunciation: "/ˈɡæðə/", category: "Daily Life", level: "PRE_INTERMEDIATE" },
  { word: "purpose", uzbek: "maqsad", russian: "цель, назначение", example: "What is the purpose of this meeting?", pronunciation: "/ˈpɜːpəs/", category: "Work & Study", level: "PRE_INTERMEDIATE" },
];

export type SeedReading = {
  title: string;
  level: Level;
  topic: string;
  text: string;
  estimatedMinutes: number;
  questions: Array<{ text: string; options: string[]; correct: number }>;
};

export const READINGS: SeedReading[] = [
  {
    title: "A Day at the Farmers' Market",
    level: "BEGINNER",
    topic: "Daily Life",
    estimatedMinutes: 4,
    text:
      "Every Saturday morning, Sara visits the farmers' market near her house. The market opens at eight o'clock and closes at noon. Sara buys fresh fruit, vegetables, bread and eggs. She also buys flowers for her mother. The sellers are friendly and the prices are low. Sara never goes home with empty hands. She says, \"Fresh food from the market tastes better.\"",
    questions: [
      { text: "When does Sara visit the market?", options: ["Every Saturday morning", "Every Sunday evening", "On Mondays", "Twice a year"], correct: 0 },
      { text: "What time does the market close?", options: ["At eight o'clock", "At noon", "At six o'clock", "It never closes"], correct: 1 },
      { text: "What does Sara buy for her mother?", options: ["Eggs", "Bread", "Flowers", "Vegetables"], correct: 2 },
      { text: "Why does Sara like the market?", options: ["It is near her office", "The food is fresh and cheap", "It is open at night", "She works there"], correct: 1 },
    ],
  },
  {
    title: "Why Sleep Matters",
    level: "PRE_INTERMEDIATE",
    topic: "Health",
    estimatedMinutes: 5,
    text:
      "Most teenagers need eight to ten hours of sleep every night, but many sleep much less. When you sleep, your brain processes what you learned during the day. Students who sleep well remember new words and grammar rules more easily. Lack of sleep, on the other hand, makes people tired, irritable and unable to concentrate. Doctors recommend going to bed at the same time every night and avoiding bright screens before sleep. In short, sleep is not a waste of time — it is one of the best study habits.",
    questions: [
      { text: "How much sleep do most teenagers need?", options: ["Four hours", "Six hours", "Eight to ten hours", "All day"], correct: 2 },
      { text: "What does the brain do during sleep?", options: ["It processes the day's learning", "It stops working", "It learns new languages", "It forgets everything"], correct: 0 },
      { text: "Which is NOT a result of lack of sleep?", options: ["Feeling tired", "Better concentration", "Feeling irritable", "Poor memory"], correct: 1 },
      { text: "What do doctors recommend before sleep?", options: ["Bright screens", "Sports", "Reading long books", "Avoiding bright screens"], correct: 3 },
      { text: "What is the main idea of the text?", options: ["Sleep is a waste of time", "Sleep helps students study better", "Teenagers like sleeping", "Screens are useful at night"], correct: 1 },
    ],
  },
  {
    title: "The Future of Remote Work",
    level: "INTERMEDIATE",
    topic: "Work & Study",
    estimatedMinutes: 6,
    text:
      "Before 2020, working from home was rare. Today, millions of people do their jobs from the kitchen table. Companies discovered that many tasks can be done online, and employees saved hours of commuting. However, remote work is not perfect. Some workers feel lonely without colleagues, and others find it hard to separate work from family life. Managers also worry about training new staff remotely. Most experts now believe the future is hybrid: three days in the office and two at home. This balance gives workers flexibility while keeping the social side of the workplace alive.",
    questions: [
      { text: "When was working from home rare?", options: ["Before 2020", "After 2030", "In the 1990s", "It was always common"], correct: 0 },
      { text: "What did companies discover?", options: ["That offices are useless", "Many tasks can be done online", "Commuting is free", "Employees dislike homes"], correct: 1 },
      { text: "What problem do some remote workers face?", options: ["Too much fresh air", "Loneliness without colleagues", "Long commutes", "Loud offices"], correct: 1 },
      { text: "What does 'hybrid' mean in the text?", options: ["Working only at night", "Working abroad", "Three days in the office and two at home", "No work at all"], correct: 2 },
      { text: "What is the author's view of hybrid work?", options: ["It is the worst option", "It is a good balance", "It will disappear soon", "It is only for managers"], correct: 1 },
    ],
  },
];
