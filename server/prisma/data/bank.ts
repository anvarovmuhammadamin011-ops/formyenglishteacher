import type { Level, QuestionType, Skill } from "@prisma/client";

export type BankQuestion = {
  type: QuestionType;
  text: string;
  options?: string[];
  correct?: number | number[];
  correctText?: string;
  explanation?: string;
};

export type BankTest = {
  title: string;
  description?: string;
  instructions?: string;
  topic: string;
  skill: Skill;
  difficulty: Level;
  timeLimitSeconds: number;
  passingScore: number;
  questions: BankQuestion[];
};

const q = (
  text: string,
  options: string[],
  correct: number | number[],
  explanation: string,
): BankQuestion => ({ type: "MULTIPLE_CHOICE", text, options, correct, explanation });

const tq = (text: string, correct: boolean, explanation: string): BankQuestion => ({
  type: "TRUE_FALSE",
  text,
  options: ["True", "False"],
  correct: correct ? 0 : 1,
  explanation,
});

export const TEST_BANK: BankTest[] = [
  {
    title: "Present Simple — Basics",
    description: "Choose the correct form to complete each sentence.",
    topic: "Present Simple",
    skill: "GRAMMAR",
    difficulty: "BEGINNER",
    timeLimitSeconds: 1200,
    passingScore: 60,
    questions: [
      q("She ___ to school every day.", ["go", "goes", "going", "gone"], 1, "Third person singular takes -s: she goes."),
      q("They ___ English every evening.", ["study", "studys", "studing", "studies"], 0, "They is plural → study (no -s)."),
      q("___ he like coffee?", ["Do", "Does", "Is", "Are"], 1, "He is third person singular → Does."),
      q("My brother ___ TV in the evening.", ["watch", "watchs", "watches", "watcheing"], 2, "Verbs ending in -ch take -es: watches."),
      q("We ___ live in Samarkand.", ["do", "does", "is", "are"], 0, "We → do (negative/affirmative helper is 'do')."),
      q("The sun ___ in the east.", ["rise", "rises", "rising", "is rising"], 1, "General truths use present simple: the sun rises."),
      q("I ___ breakfast at 7 o'clock.", ["have", "has", "having", "haves"], 0, "I → have."),
      q("Water ___ at 100 degrees Celsius.", ["boil", "boils", "boiling", "is boiling"], 1, "Scientific facts use present simple."),
      q("She doesn't ___ milk.", ["likes", "liking", "like", "liked"], 2, "After doesn't use the base form: like."),
      q("___ your father work in a bank?", ["Do", "Does", "Is", "Are"], 1, "Your father = he → Does."),
      q("We usually ___ our homework after school.", ["does", "do", "doing", "is doing"], 1, "We → do."),
      q("He ___ his teeth twice a day.", ["brush", "brushs", "brushes", "brushing"], 2, "Verbs ending in -sh take -es: brushes."),
      q("My friends ___ football on Saturdays.", ["plays", "play", "playing", "are play"], 1, "My friends is plural → play."),
      q("The train ___ at 8:30 every morning.", ["leave", "leaves", "leaving", "is leave"], 1, "Timetables use present simple + -s."),
      q("I ___ understand this question.", ["am not", "don't", "doesn't", "isn't"], 1, "I → don't."),
      q("Katya ___ from Russia.", ["come", "comes", "coming", "is come"], 1, "Katya (she) → comes."),
      q("They ___ to music in the evening.", ["listen", "listens", "listening", "are listen"], 0, "They → listen."),
      q("My mother ___ delicious cakes.", ["make", "makes", "makeing", "maked"], 1, "My mother (she) → makes."),
      q("___ you speak English?", ["Do", "Does", "Is", "Are"], 0, "You → Do."),
      q("Cats ___ during the day.", ["sleeps", "sleep", "sleeping", "is sleep"], 1, "Cats is plural → sleep."),
    ],
  },
  {
    title: "Past Simple — Regular & Irregular",
    description: "Complete the sentences with the correct past simple form.",
    topic: "Past Simple",
    skill: "GRAMMAR",
    difficulty: "ELEMENTARY",
    timeLimitSeconds: 900,
    passingScore: 60,
    questions: [
      q("Yesterday I ___ to the cinema.", ["go", "went", "gone", "going"], 1, "'Go' is irregular → went."),
      q("She ___ a letter last week.", ["write", "wrote", "written", "writes"], 1, "'Write' is irregular → wrote."),
      q("They ___ not at home yesterday.", ["was", "were", "are", "is"], 1, "They → were."),
      q("___ you watch TV last night?", ["Did", "Do", "Does", "Are"], 0, "Past questions use Did + base form."),
      q("He ___ his keys at work.", ["lose", "lost", "loses", "losing"], 1, "'Lose' is irregular → lost."),
      q("We ___ a great time at the party.", ["have", "had", "has", "having"], 1, "'Have' is irregular → had."),
      q("The film ___ very interesting.", ["was", "were", "is", "are"], 0, "The film (it) → was."),
      q("I ___ my homework before dinner.", ["did", "do", "does", "doing"], 0, "'Do' in past → did."),
      q("Where ___ you go last summer?", ["did", "do", "does", "were"], 0, "Past question: Where did you go?"),
      q("She ___ an apple for lunch.", ["ate", "eat", "eaten", "eats"], 0, "'Eat' is irregular → ate."),
      q("It ___ a lot of rain in April.", ["rained", "rains", "raining", "rain"], 0, "Finished past time (in April) → rained."),
      q("My father ___ me a new bike.", ["bought", "buyed", "buys", "buying"], 0, "'Buy' is irregular → bought."),
      q("They ___ the door with a key.", ["opened", "open", "opening", "opens"], 0, "Regular verb → opened."),
      q("We ___ our friends last weekend.", ["visited", "visit", "visits", "visiting"], 0, "Regular verb → visited."),
      q("He ___ not come to school yesterday.", ["did", "was", "were", "has"], 0, "Negation: did not come."),
    ],
  },
  {
    title: "Present Continuous — Actions Now",
    description: "Choose present simple or present continuous correctly.",
    topic: "Present Continuous",
    skill: "GRAMMAR",
    difficulty: "PRE_INTERMEDIATE",
    timeLimitSeconds: 900,
    passingScore: 60,
    questions: [
      q("Look! The baby ___.", ["sleeps", "is sleeping", "sleep", "slept"], 1, "'Look!' signals an action happening now."),
      q("She ___ dinner at the moment.", ["cooks", "cook", "is cooking", "cooked"], 2, "'At the moment' → is cooking."),
      q("___ they playing football now?", ["Are", "Is", "Do", "Does"], 0, "They → Are + -ing."),
      q("I ___ this song.", ["like", "am liking", "likes", "is liking"], 0, "Stative verbs like 'like' stay in present simple."),
      q("Be quiet! The teacher ___.", ["comes", "is coming", "come", "came"], 1, "Action happening now → is coming."),
      q("The kids ___ in the garden.", ["play", "plays", "are playing", "is playing"], 2, "The kids (they) → are playing."),
      q("It ___ heavily right now.", ["rains", "raining", "is raining", "rain"], 2, "'Right now' → is raining."),
      q("He ___ TV at the moment.", ["watch", "watches", "is watching", "watched"], 2, "Now → is watching."),
      q("We ___ a new project this month.", ["start", "starts", "are starting", "started"], 2, "Temporary action in progress → are starting."),
      q("Listen! Someone ___.", ["sings", "is singing", "sing", "sang"], 1, "'Listen!' → is singing."),
      q("___ you listening to me?", ["Do", "Are", "Is", "Does"], 1, "You → Are + -ing."),
      q("The baby ___ now.", ["cries", "cry", "is crying", "cried"], 2, "'Now' → is crying."),
      q("My sister ___ her room at the moment.", ["cleans", "clean", "is cleaning", "cleaned"], 2, "At the moment → is cleaning."),
      q("Don't go out! It ___.", ["snows", "is snowing", "snow", "snowed"], 1, "Happening now → is snowing."),
      q("I ___ my homework right now.", ["do", "am doing", "does", "did"], 1, "I → am doing."),
    ],
  },
  {
    title: "Vocabulary Challenge — Everyday Words",
    description: "Choose the word with the correct meaning.",
    topic: "Everyday Vocabulary",
    skill: "VOCABULARY",
    difficulty: "ELEMENTARY",
    timeLimitSeconds: 720,
    passingScore: 60,
    questions: [
      q("What is the opposite of 'expensive'?", ["cheap", "costly", "valuable", "price"], 0, "Expensive ↔ cheap."),
      q("'Big' means:", ["large", "tiny", "short", "low"], 0, "Big = large."),
      q("A person who teaches students is a:", ["doctor", "teacher", "driver", "farmer"], 1, "Teachers work in schools."),
      q("'Happy' is the opposite of:", ["sad", "angry", "tired", "glad"], 0, "Happy ↔ sad."),
      q("'To buy' means:", ["to get something for money", "to sell", "to eat", "to break"], 0, "Buy = purchase with money."),
      q("Which word is a fruit?", ["potato", "apple", "bread", "cheese"], 1, "An apple is a fruit."),
      q("'Beautiful' means:", ["pretty", "ugly", "dirty", "loud"], 0, "Beautiful = pretty."),
      q("A building where we see doctors:", ["school", "hospital", "bank", "shop"], 1, "Doctors work in hospitals."),
      q("'Quickly' is the opposite of:", ["slowly", "fast", "near", "soon"], 0, "Quickly ↔ slowly."),
      q("A lot of water falling from the sky is:", ["rain", "snow", "wind", "fog"], 0, "Rain falls from clouds."),
      q("'Start' is the opposite of:", ["begin", "finish", "open", "go"], 1, "Start ↔ finish (begin is a synonym)."),
      q("The season after winter is:", ["summer", "autumn", "spring", "winter"], 2, "Spring follows winter."),
      q("Which word is a colour?", ["chair", "red", "table", "run"], 1, "Red is a colour."),
      q("'To create' means:", ["to make something new", "to destroy", "to break", "to lose"], 0, "Create = make."),
      q("The opposite of 'hot' is:", ["cold", "warm", "ice", "heat"], 0, "Hot ↔ cold."),
      q("A person who writes books is an:", ["author", "reader", "actor", "artist"], 0, "Authors write books."),
      q("'To choose' means:", ["to select", "to refuse", "to reject", "to avoid"], 0, "Choose = select."),
      q("Which animal says 'meow'?", ["dog", "cat", "cow", "bird"], 1, "Cats say meow."),
      q("The opposite of 'ancient' is:", ["modern", "old", "historic", "wise"], 0, "Ancient ↔ modern."),
      q("'To read' means:", ["to understand written words", "to speak loudly", "to write quickly", "to listen to music"], 0, "Read = understand text."),
    ],
  },
  {
    title: "Reading — The Internet and Modern Life",
    description:
      "Read the text and answer the questions.\n\nThe Internet has changed the way people live and work. Today, students can study online, and many people work from home. Shops sell products over the Internet, and you can order food or clothes without leaving your house. However, spending too much time online can be harmful. Doctors advise people to take breaks and spend time outdoors. The Internet is a useful tool, but it must be used wisely.",
    instructions:
      "Read the text carefully. You have 15 minutes. Do not use a dictionary.",
    topic: "Reading Comprehension",
    skill: "READING",
    difficulty: "INTERMEDIATE",
    timeLimitSeconds: 900,
    passingScore: 60,
    questions: [
      q("What has the Internet changed?", ["the way people live and work", "the weather", "school hours", "the price of food"], 0, "Sentence 1: 'changed the way people live and work'."),
      q("What can students do online?", ["study", "only play games", "cook", "drive"], 0, "'students can study online'."),
      q("Where do many people work nowadays?", ["at home", "in space", "only in shops", "on farms"], 0, "'many people work from home'."),
      q("What can you order without leaving home?", ["food or clothes", "a new car", "a plane", "nothing"], 0, "'order food or clothes without leaving your house'."),
      q("What can happen if we spend too much time online?", ["it can be harmful", "nothing", "we become taller", "we get faster"], 0, "'spending too much time online can be harmful'."),
      q("What do doctors advise?", ["take breaks and spend time outdoors", "eat more", "watch more TV", "work longer hours"], 0, "'Doctors advise people to take breaks and spend time outdoors'."),
      q("How is the Internet described at the end?", ["a useful tool", "a dangerous machine", "a game", "a toy"], 0, "'The Internet is a useful tool'."),
      q("The word 'wisely' means:", ["in a smart way", "carelessly", "quickly", "angrily"], 0, "Wisely = in a clever, sensible way."),
    ],
  },
];
