import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useScreenWidth } from "../layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { COINS_PER_CORRECT, pickQuestions, TRIVIA_LENGTH } from "../lounge";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";

type Icon = keyof typeof Ionicons.glyphMap;

function shuffle<T>(list: T[]) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function GameShell({ kicker, title, onBack, right, children }: { kicker: string; title: string; onBack: () => void; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.circle, pressed && { backgroundColor: colors.plum }]}>
          <Ionicons name="arrow-back" size={18} color={colors.cream} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.headTitle}>{title}</Text>
        </View>
        {right}
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

function CoinChip() {
  const store = useStore();
  return (
    <View style={styles.coinChip}>
      <View style={styles.coin}>
        <Text style={styles.coinR}>R</Text>
      </View>
      <Text style={styles.coinText}>{store.coins}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function GoldButton({ label, icon, onPress, ghost }: { label: string; icon?: Icon; onPress: () => void; ghost?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ghost ? styles.ghost : styles.gold, pressed && { opacity: 0.9 }]}>
      {icon ? <Ionicons name={icon} size={17} color={ghost ? colors.gold : colors.night} /> : null}
      <Text style={ghost ? styles.ghostText : styles.goldText}>{label}</Text>
    </Pressable>
  );
}

export function TriviaScreen({ navigation }: NativeStackScreenProps<CustomerStack, "Trivia">) {
  const store = useStore();
  const [round, setRound] = useState(0);
  const quiz = useMemo(() => pickQuestions(), [round]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<{ score: number; earned: number; practice: boolean } | null>(null);
  const scoreRef = useRef(0);
  const practice = useRef(store.triviaPlayedToday);

  const question = quiz[index];

  const choose = (option: number) => {
    if (chosen !== null) return;
    setChosen(option);
    if (option === question.answer) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }
    setTimeout(() => {
      if (index + 1 < quiz.length) {
        setIndex(index + 1);
        setChosen(null);
        return;
      }
      const earned = store.finishTrivia(scoreRef.current);
      setResult({ score: scoreRef.current, earned, practice: practice.current });
    }, 1100);
  };

  const again = () => {
    practice.current = true;
    scoreRef.current = 0;
    setScore(0);
    setIndex(0);
    setChosen(null);
    setResult(null);
    setRound((value) => value + 1);
  };

  return (
    <GameShell kicker="ROVEYA LOUNGE" title="Trip trivia" onBack={() => navigation.goBack()} right={<CoinChip />}>
      {result ? (
        <View style={styles.result}>
          <View style={styles.ring}>
            <Text style={styles.ringScore}>
              {result.score}
              <Text style={styles.ringOf}> / {quiz.length}</Text>
            </Text>
          </View>
          <Text style={styles.resultTitle}>{result.score >= 4 ? "Brilliant ride!" : result.score >= 2 ? "Nicely played." : "Good start."}</Text>
          {result.earned > 0 ? (
            <View style={styles.earned}>
              <View style={styles.coin}>
                <Text style={styles.coinR}>R</Text>
              </View>
              <Text style={styles.earnedText}>+{result.earned} coins added</Text>
            </View>
          ) : (
            <Text style={styles.resultLine}>{result.practice ? "Today's coins are already collected. Come back tomorrow for more." : "Get a few right tomorrow to earn coins."}</Text>
          )}
          <View style={{ alignSelf: "stretch", gap: 10, marginTop: 24 }}>
            <GoldButton label="Play again" icon="refresh" onPress={again} />
            <GoldButton label="Back to Lounge" ghost onPress={() => navigation.goBack()} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.dots}>
            {quiz.map((item, i) => (
              <View key={item.q} style={[styles.qDot, i < index && styles.qDotDone, i === index && styles.qDotNow]} />
            ))}
          </View>
          <View style={styles.statsRow}>
            <Stat label="QUESTION" value={`${index + 1} of ${quiz.length}`} />
            <Stat label="SCORE" value={String(score)} />
            <Stat label="COINS" value={practice.current ? "Practice" : `+${score * COINS_PER_CORRECT}`} />
          </View>
          <View style={styles.qCard}>
            <Text style={styles.kicker}>{question.topic.toUpperCase()}</Text>
            <Text style={styles.qText}>{question.q}</Text>
          </View>
          <View style={{ gap: 10 }}>
            {question.options.map((option, i) => {
              const revealed = chosen !== null;
              const right = revealed && i === question.answer;
              const wrong = revealed && i === chosen && i !== question.answer;
              return (
                <Pressable key={option} disabled={revealed} onPress={() => choose(i)} style={({ pressed }) => [styles.option, pressed && { borderColor: colors.gold }, right && styles.optionRight, wrong && styles.optionWrong]}>
                  <View style={[styles.letter, right && { backgroundColor: colors.night, borderColor: colors.night }]}>
                    <Text style={[styles.letterText, right && { color: colors.gold }]}>{"ABCD"[i]}</Text>
                  </View>
                  <Text style={[styles.optionText, right && { color: colors.night }]}>{option}</Text>
                  {right ? <Ionicons name="checkmark-circle" size={20} color={colors.night} /> : wrong ? <Ionicons name="close-circle" size={20} color="#E8857F" /> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fine}>
            {practice.current ? "Practice round. Coins are earned on the first round each day." : `${TRIVIA_LENGTH} questions · ${COINS_PER_CORRECT} coins for each right answer`}
          </Text>
        </>
      )}
    </GameShell>
  );
}

export function GameScreen({ navigation, route }: NativeStackScreenProps<CustomerStack, "Game">) {
  const back = () => navigation.goBack();
  if (route.params.id === "memory") return <MemoryGame onBack={back} />;
  if (route.params.id === "2048") return <Game2048 onBack={back} />;
  return <TicTacToe onBack={back} />;
}

const memoryIcons: Icon[] = ["bicycle", "car-sport", "cube", "airplane", "train", "star", "heart", "map"];

function MemoryGame({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const width = useScreenWidth();
  const board = Math.min(width - 32, 400);
  const cell = Math.floor((board - 30) / 4);
  const [deck, setDeck] = useState(() => shuffle([...memoryIcons, ...memoryIcons]));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const [record, setRecord] = useState(false);
  const won = matched.length === deck.length;

  useEffect(() => {
    if (!started || won) return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [started, won]);

  useEffect(() => {
    if (won) setRecord(store.saveBest("memory", moves, true));
  }, [won]);

  const tap = (index: number) => {
    if (won || flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    setStarted(true);
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;
    setMoves((value) => value + 1);
    const [a, b] = next;
    if (deck[a] === deck[b]) {
      setTimeout(() => {
        setMatched((list) => [...list, a, b]);
        setFlipped([]);
      }, 260);
    } else {
      setTimeout(() => setFlipped([]), 750);
    }
  };

  const reset = () => {
    setDeck(shuffle([...memoryIcons, ...memoryIcons]));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setSeconds(0);
    setStarted(false);
    setRecord(false);
  };

  const best = store.bests.memory;
  return (
    <GameShell kicker="QUICK GAME" title="Memory Match" onBack={onBack} right={<CoinChip />}>
      <View style={styles.statsRow}>
        <Stat label="MOVES" value={String(moves)} />
        <Stat label="TIME" value={`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`} />
        <Stat label="BEST" value={best !== undefined ? `${best} moves` : "–"} />
      </View>
      <View style={[styles.memoryBoard, { width: board, height: board }]}>
        {deck.map((icon, index) => {
          const open = flipped.includes(index) || matched.includes(index);
          const done = matched.includes(index);
          return (
            <Pressable key={index} onPress={() => tap(index)} style={[styles.memoryCard, { width: cell, height: cell }, open && styles.memoryOpen, done && styles.memoryDone]}>
              {open ? <Ionicons name={icon} size={cell * 0.42} color={done ? colors.night : colors.gold} /> : <Text style={[styles.memoryR, { fontSize: cell * 0.32, lineHeight: cell * 0.4 }]}>R</Text>}
            </Pressable>
          );
        })}
      </View>
      {won ? (
        <View style={styles.winBox}>
          <Text style={styles.winTitle}>{record ? "New best!" : "All pairs found!"}</Text>
          <Text style={styles.resultLine}>
            {moves} moves in {seconds} seconds.
          </Text>
          <GoldButton label="Play again" icon="refresh" onPress={reset} />
        </View>
      ) : (
        <View style={{ marginTop: 18 }}>
          <GoldButton label="New game" icon="refresh" ghost onPress={reset} />
        </View>
      )}
    </GameShell>
  );
}

type Dir = "left" | "right" | "up" | "down";

function slideLine(line: number[]) {
  const values = line.filter(Boolean);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      out.push(values[i] * 2);
      gained += values[i] * 2;
      i += 1;
    } else out.push(values[i]);
  }
  while (out.length < 4) out.push(0);
  return { out, gained };
}

function lineIndexes(dir: Dir) {
  const lines: number[][] = [];
  for (let k = 0; k < 4; k += 1) {
    const row = [0, 1, 2, 3].map((i) => k * 4 + i);
    const col = [0, 1, 2, 3].map((i) => i * 4 + k);
    if (dir === "left") lines.push(row);
    if (dir === "right") lines.push([...row].reverse());
    if (dir === "up") lines.push(col);
    if (dir === "down") lines.push([...col].reverse());
  }
  return lines;
}

function addTile(grid: number[]) {
  const empty = grid.map((value, index) => (value ? -1 : index)).filter((index) => index >= 0);
  if (!empty.length) return grid;
  const next = [...grid];
  next[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function canMove(grid: number[]) {
  for (let i = 0; i < 16; i += 1) {
    if (!grid[i]) return true;
    if (i % 4 < 3 && grid[i] === grid[i + 1]) return true;
    if (i < 12 && grid[i] === grid[i + 4]) return true;
  }
  return false;
}

const tileColors: Record<number, [string, string]> = {
  2: [colors.mist, colors.cream],
  4: [colors.plum, colors.cream],
  8: [colors.cherry, colors.cream],
  16: [colors.burgundy, colors.cream],
  32: ["#86203F", colors.cream],
  64: ["#A12E4A", colors.cream],
  128: ["#8F6A0C", colors.cream],
  256: ["#B08300", colors.night],
  512: [colors.gold, colors.night],
  1024: [colors.goldBright, colors.night],
  2048: [colors.cream, colors.night],
};

function fresh2048() {
  return addTile(addTile(Array(16).fill(0)));
}

function Game2048({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const width = useScreenWidth();
  const board = Math.min(width - 32, 400);
  const gap = 8;
  const cell = Math.floor((board - 2 - gap * 5) / 4);
  const [grid, setGrid] = useState(fresh2048);
  const [score, setScore] = useState(0);
  const [reached, setReached] = useState(false);
  const over = !canMove(grid);
  const moveRef = useRef<(dir: Dir) => void>(() => {});

  moveRef.current = (dir: Dir) => {
    if (over) return;
    const next = [...grid];
    let gained = 0;
    let moved = false;
    for (const line of lineIndexes(dir)) {
      const { out, gained: add } = slideLine(line.map((index) => grid[index]));
      gained += add;
      line.forEach((index, i) => {
        if (next[index] !== out[i]) moved = true;
        next[index] = out[i];
      });
    }
    if (!moved) return;
    const placed = addTile(next);
    setGrid(placed);
    if (gained) {
      const total = score + gained;
      setScore(total);
      store.saveBest("2048", total);
    }
    if (!reached && placed.includes(2048)) setReached(true);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gesture) => {
        const { dx, dy } = gesture;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) moveRef.current(dx > 0 ? "right" : "left");
        else moveRef.current(dy > 0 ? "down" : "up");
      },
    }),
  ).current;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const keys: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const onKey = (event: KeyboardEvent) => {
      const dir = keys[event.key];
      if (!dir) return;
      event.preventDefault();
      moveRef.current(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reset = () => {
    setGrid(fresh2048());
    setScore(0);
    setReached(false);
  };

  return (
    <GameShell kicker="QUICK GAME" title="2048" onBack={onBack} right={<CoinChip />}>
      <View style={styles.statsRow}>
        <Stat label="SCORE" value={score.toLocaleString("en-IN")} />
        <Stat label="BEST" value={(store.bests["2048"] ?? 0).toLocaleString("en-IN")} />
        <Stat label="TOP TILE" value={String(Math.max(...grid))} />
      </View>
      <View style={[styles.board2048, { width: board, height: board, padding: gap, gap }]} {...responder.panHandlers}>
        {grid.map((value, index) => {
          const [bg, fg] = tileColors[value] ?? [colors.cream, colors.night];
          return (
            <View key={index} style={[styles.tile, { width: cell, height: cell }, value ? { backgroundColor: bg } : null]}>
              {value ? <Text style={[styles.tileText, { color: fg, fontSize: value >= 1024 ? cell * 0.3 : value >= 128 ? cell * 0.36 : cell * 0.42 }]}>{value}</Text> : null}
            </View>
          );
        })}
        {over ? (
          <View style={styles.overlay}>
            <Text style={styles.winTitle}>No moves left</Text>
            <Text style={styles.resultLine}>You scored {score.toLocaleString("en-IN")}.</Text>
            <GoldButton label="Try again" icon="refresh" onPress={reset} />
          </View>
        ) : null}
      </View>
      <Text style={styles.fine}>{reached ? "You reached 2048! Keep going for a bigger tile." : Platform.OS === "web" ? "Swipe on the board or use the arrow keys." : "Swipe on the board to move the tiles."}</Text>
      <View style={{ marginTop: 14 }}>
        <GoldButton label="New game" icon="refresh" ghost onPress={reset} />
      </View>
    </GameShell>
  );
}

type Mark = "X" | "O" | "";
const winLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winnerOf(board: Mark[]) {
  for (const line of winLines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a], line };
  }
  return null;
}

function botMove(board: Mark[]) {
  const open = board.map((mark, index) => (mark ? -1 : index)).filter((index) => index >= 0);
  const tryFor = (mark: Mark) =>
    open.find((index) => {
      const next = [...board];
      next[index] = mark;
      return winnerOf(next)?.mark === mark;
    });
  const win = tryFor("O");
  if (win !== undefined) return win;
  const block = tryFor("X");
  if (block !== undefined) return block;
  if (!board[4]) return 4;
  const corners = [0, 2, 6, 8].filter((index) => !board[index]);
  if (corners.length && Math.random() < 0.7) return corners[Math.floor(Math.random() * corners.length)];
  return open[Math.floor(Math.random() * open.length)];
}

function TicTacToe({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const width = useScreenWidth();
  const board = Math.min(width - 32, 360);
  const [mode, setMode] = useState<"bot" | "friend">("bot");
  const [cells, setCells] = useState<Mark[]>(Array(9).fill(""));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [tally, setTally] = useState({ x: 0, o: 0, draw: 0 });
  const result = winnerOf(cells);
  const full = cells.every(Boolean);
  const finished = Boolean(result) || full;
  const thinking = mode === "bot" && turn === "O" && !finished;

  useEffect(() => {
    if (!finished) return;
    if (result?.mark === "X") {
      setTally((t) => ({ ...t, x: t.x + 1 }));
      if (mode === "bot") store.saveBest("ttt", (store.bests.ttt ?? 0) + 1);
    } else if (result?.mark === "O") setTally((t) => ({ ...t, o: t.o + 1 }));
    else setTally((t) => ({ ...t, draw: t.draw + 1 }));
  }, [finished]);

  useEffect(() => {
    if (!thinking) return;
    const timer = setTimeout(() => {
      setCells((current) => {
        const next = [...current];
        next[botMove(current)] = "O";
        return next;
      });
      setTurn("X");
    }, 500);
    return () => clearTimeout(timer);
  }, [thinking]);

  const play = (index: number) => {
    if (finished || cells[index] || thinking) return;
    const next = [...cells];
    next[index] = turn;
    setCells(next);
    setTurn(turn === "X" ? "O" : "X");
  };

  const newRound = () => {
    setCells(Array(9).fill(""));
    setTurn("X");
  };

  const switchMode = (next: "bot" | "friend") => {
    setMode(next);
    setTally({ x: 0, o: 0, draw: 0 });
    newRound();
  };

  const oName = mode === "bot" ? "ROVEYA" : "Friend";
  const status = result
    ? result.mark === "X"
      ? mode === "bot" ? "You win this round!" : "X wins this round!"
      : mode === "bot" ? "ROVEYA wins this one." : "O wins this round!"
    : full
      ? "It's a draw."
      : thinking
        ? "ROVEYA is thinking…"
        : mode === "bot"
          ? "Your turn. You are X."
          : `${turn} to play`;

  return (
    <GameShell kicker="QUICK GAME" title="Tic Tac Toe" onBack={onBack} right={<CoinChip />}>
      <View style={styles.modeRow}>
        {(
          [
            ["bot", "Play ROVEYA bot", "hardware-chip-outline"],
            ["friend", "Play a co-rider", "people-outline"],
          ] as ["bot" | "friend", string, Icon][]
        ).map(([key, label, icon]) => (
          <Pressable key={key} onPress={() => switchMode(key)} style={[styles.modeChip, mode === key && styles.modeOn]}>
            <Ionicons name={icon} size={14} color={mode === key ? colors.night : colors.gold} />
            <Text style={[styles.modeText, mode === key && { color: colors.night }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.statsRow}>
        <Stat label={mode === "bot" ? "YOU · X" : "X"} value={String(tally.x)} />
        <Stat label="DRAWS" value={String(tally.draw)} />
        <Stat label={`${oName.toUpperCase()} · O`} value={String(tally.o)} />
      </View>
      <Text style={styles.status}>{status}</Text>
      <View style={[styles.tttBoard, { width: board, height: board }]}>
        {cells.map((mark, index) => {
          const lit = result?.line.includes(index);
          return (
            <Pressable key={index} onPress={() => play(index)} style={[styles.tttCell, { width: Math.floor((board - 16) / 3), height: Math.floor((board - 16) / 3) }, lit && styles.tttLit]}>
              {mark === "X" ? <Ionicons name="close" size={board / 5} color={lit ? colors.night : colors.gold} /> : null}
              {mark === "O" ? <Ionicons name="ellipse-outline" size={board / 6.5} color={lit ? colors.night : colors.cream} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 18 }}>
        <GoldButton label={finished ? "Next round" : "Restart round"} icon="refresh" ghost={!finished} onPress={newRound} />
      </View>
    </GameShell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  headTitle: { marginTop: 2, color: colors.cream, fontFamily: type.display, fontSize: 19, lineHeight: 23, letterSpacing: -0.2 },
  body: { padding: 16, paddingBottom: 60, alignItems: "stretch" },
  coinChip: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 5, paddingRight: 12, height: 36, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold },
  coin: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  coinR: { color: colors.night, fontFamily: type.bold, fontSize: 12, lineHeight: 15 },
  coinText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center" },
  statLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9, letterSpacing: 1.6 },
  statValue: { marginTop: 3, color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  gold: { height: 50, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  goldText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15 },
  ghost: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ghostText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  fine: { marginTop: 14, color: colors.faint, fontFamily: type.body, fontSize: 12.5, textAlign: "center" },
  dots: { flexDirection: "row", gap: 6, marginBottom: 14 },
  qDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(246,241,220,0.12)" },
  qDotDone: { backgroundColor: colors.gold },
  qDotNow: { backgroundColor: colors.goldBright, opacity: 0.6 },
  qCard: { padding: 18, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, marginBottom: 14, minHeight: 140, justifyContent: "center" },
  qText: { marginTop: 8, color: colors.cream, fontFamily: type.display, fontSize: 20, lineHeight: 27, letterSpacing: -0.2 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  optionRight: { backgroundColor: colors.gold, borderColor: colors.gold },
  optionWrong: { borderColor: "#E8857F" },
  letter: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.night },
  letterText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  optionText: { flex: 1, color: colors.cream, fontFamily: type.label, fontSize: 15 },
  result: { alignItems: "center", paddingTop: 20 },
  ring: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: colors.gold, alignItems: "center", justifyContent: "center", backgroundColor: colors.inkwell },
  ringScore: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 48 },
  ringOf: { color: colors.faint, fontSize: 22 },
  resultTitle: { marginTop: 18, color: colors.cream, fontFamily: type.display, fontSize: 24, letterSpacing: -0.3 },
  resultLine: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 14, textAlign: "center", lineHeight: 20 },
  earned: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold },
  earnedText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 15 },
  memoryBoard: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  memoryCard: { borderRadius: 16, backgroundColor: colors.burgundy, borderWidth: 1, borderColor: "rgba(214,160,0,0.45)", alignItems: "center", justifyContent: "center" },
  memoryOpen: { backgroundColor: colors.night, borderColor: colors.gold },
  memoryDone: { backgroundColor: colors.gold, borderColor: colors.gold },
  memoryR: { color: colors.gold, fontFamily: type.display },
  winBox: { marginTop: 18, padding: 18, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold, gap: 10, alignItems: "stretch" },
  winTitle: { color: colors.cream, fontFamily: type.display, fontSize: 22, textAlign: "center", letterSpacing: -0.3 },
  board2048: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tile: { borderRadius: 12, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  tileText: { fontFamily: type.labelStrong },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, backgroundColor: "rgba(18,6,13,0.86)", alignItems: "stretch", justifyContent: "center", padding: 28, gap: 10 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  modeChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  modeOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  modeText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 12.5 },
  status: { marginBottom: 14, color: colors.cream, fontFamily: type.display, fontSize: 19, textAlign: "center" },
  tttBoard: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tttCell: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  tttLit: { backgroundColor: colors.gold, borderColor: colors.gold },
});
