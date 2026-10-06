import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ear, Play, RefreshCcw, Shuffle } from "lucide-react";
import { api } from "@/lib/api";
import type { Paginated, VocabularyWord } from "@/lib/types";
import { Badge, Button, Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";

export default function SpeakingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["vocabulary", "speaking-deck"],
    queryFn: () => api.get<Paginated<VocabularyWord>>("/vocabulary", { query: { page: 1, limit: 60 } }),
  });

  const [index, setIndex] = useState(0);
  const [showUzbek, setShowUzbek] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  const words = data?.items ?? [];
  const word = words[Math.min(index, Math.max(0, words.length - 1))];

  const englishVoices = useMemo(() => {
    if (typeof speechSynthesis === "undefined") return [];
    const all = speechSynthesis.getVoices();
    return all.filter((v) => v.lang.startsWith("en"));
  }, []);

  function speak() {
    if (!word || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word.word);
    u.lang = voice?.lang ?? "en-US";
    if (voice) u.voice = voice;
    u.rate = 0.9;
    speechSynthesis.speak(u);
    if (word.example) {
      setTimeout(() => {
        const u2 = new SpeechSynthesisUtterance(word.example!);
        u2.lang = u.lang;
        if (voice) u2.voice = voice;
        u2.rate = 0.95;
        speechSynthesis.speak(u2);
      }, 900);
    }
  }

  function next() {
    setShowUzbek(false);
    setIndex((i) => (words.length ? (i + 1) % words.length : 0));
  }

  if (isLoading) return <PageLoader label="Loading pronunciation deck…" />;

  return (
    <>
      <PageHeader
        title="Speaking & pronunciation"
        subtitle="Listen, repeat and shadow common words from your vocabulary deck."
        actions={
          englishVoices.length > 1 ? (
            <select
              className="h-9 rounded-lg border border-ink-300 bg-white px-2 text-xs"
              value={voice?.name ?? ""}
              onChange={(e) => setVoice(englishVoices.find((v) => v.name === e.target.value) ?? null)}
            >
              <option value="">Default voice</option>
              {englishVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {words.length === 0 ? (
        <EmptyState title="No vocabulary yet" hint="Ask your teacher to add words to the vocabulary bank first." />
      ) : (
        <div className="mx-auto max-w-xl">
          <Card className="p-8 text-center">
            <Badge tone="sky" className="mx-auto">
              <Ear className="h-3 w-3" /> word {(index % words.length) + 1} of {words.length}
            </Badge>
            <h2 className="mt-5 text-4xl font-extrabold tracking-tight text-ink-900">{word.word}</h2>
            {word.pronunciation && <p className="mt-1 font-mono text-sm text-ink-400">/{word.pronunciation}/</p>}
            <p className="mt-3 text-ink-500">{showUzbek ? word.uzbek : "Say it out loud before revealing the meaning."}</p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button onClick={speak}>
                <Play className="h-4 w-4" /> Play audio
              </Button>
              <Button variant="outline" onClick={() => setShowUzbek((v) => !v)}>
                {showUzbek ? "Hide" : "Reveal"} meaning
              </Button>
              <Button variant="ghost" onClick={next}>
                <Shuffle className="h-4 w-4" /> Next word
              </Button>
            </div>

            {word.example && (
              <div className="mt-6 rounded-xl bg-ink-50 p-4 text-left ring-1 ring-ink-200">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Example</p>
                <p className="mt-1 text-sm italic text-ink-700">"{word.example}"</p>
                <Button variant="ghost" size="sm" className="mt-1 px-0" onClick={() => {
                  speechSynthesis.cancel();
                  const u = new SpeechSynthesisUtterance(word.example!);
                  u.lang = voice?.lang ?? "en-US";
                  if (voice) u.voice = voice;
                  speechSynthesis.speak(u);
                }}>
                  <RefreshCcw className="h-3 w-3" /> Play example
                </Button>
              </div>
            )}
          </Card>
          <p className="mt-3 text-center text-xs text-ink-500">
            Tip: repeat each word 3 times — once slowly, once at natural speed, once inside the example sentence.
          </p>
        </div>
      )}
    </>
  );
}
