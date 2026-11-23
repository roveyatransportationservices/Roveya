import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { guides, REDEEM_COINS, REDEEM_VALUE, REFERRAL_BONUS, rewardLabel, TRIVIA_LENGTH, COINS_PER_CORRECT } from "../lounge";
import { useScreenWidth } from "../layout";
import { cityById } from "../pool";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack, CustomerTabs, GameId, LoungeSection } from "../navigation";
import type { ScratchCard } from "../types";

type Props = CompositeScreenProps<BottomTabScreenProps<CustomerTabs, "Lounge">, NativeStackScreenProps<CustomerStack>>;
type Section = LoungeSection;
type Icon = keyof typeof Ionicons.glyphMap;

const games: { id: GameId; title: string; line: string; icon: Icon; best: (score: number) => string }[] = [
  { id: "memory", title: "Memory Match", line: "Flip cards and find the ROVEYA pairs.", icon: "grid-outline", best: (score) => `Best: ${score} moves` },
  { id: "2048", title: "2048", line: "Swipe and join the tiles to reach 2048.", icon: "apps-outline", best: (score) => `Best: ${score.toLocaleString("en-IN")}` },
  { id: "ttt", title: "Tic Tac Toe", line: "Play the ROVEYA bot or the rider next to you.", icon: "close-circle-outline", best: (score) => `Wins: ${score}` },
];

export function LoungeScreen({ navigation, route }: Props) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<Section>(route.params?.section ?? "play");

  useEffect(() => {
    if (route.params?.section) setSection(route.params.section);
  }, [route.params?.section]);
  const [open, setOpen] = useState<string | null>("khammam");
  const [scratching, setScratching] = useState<ScratchCard | null>(null);
  const [note, setNote] = useState("");
  const firstName = (store.session?.name ?? "").trim().split(/\s+/)[0] || "RIDER";
  const referral = `ROVEYA-${firstName.toUpperCase().slice(0, 8)}${REFERRAL_BONUS}`;
  const fresh = store.cards.filter((card) => !card.scratched).length;

  const share = async () => {
    const message = `Ride with ROVEYA. Use my code ${referral} and we both get ₹${REFERRAL_BONUS} after your first ride.`;
    try {
      const browser = Platform.OS === "web" && typeof navigator !== "undefined" ? navigator : null;
      if (browser && typeof browser.share !== "function") {
        await browser.clipboard?.writeText(message);
        setNote("Invite copied. Paste it in any chat.");
        return;
      }
      await Share.share({ message });
    } catch {
      setNote("Your code is ready to share.");
    }
  };

  const redeem = () => {
    setNote(store.redeemCoins() ? `₹${REDEEM_VALUE} added to your wallet.` : `Collect ${REDEEM_COINS - store.coins} more coins to redeem.`);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: Math.max(insets.top, 12) + 8 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>ROVEYA LOUNGE</Text>
            <Text style={styles.hello}>Play, earn, explore.</Text>
          </View>
          <Pressable onPress={() => setSection("rewards")} style={styles.coinChip}>
            <View style={styles.coin}>
              <Text style={styles.coinR}>R</Text>
            </View>
            <Text style={styles.coinText}>{store.coins}</Text>
          </Pressable>
        </View>

        <View style={styles.segment}>
          {(
            [
              ["play", "Play", "game-controller-outline"],
              ["rewards", "Rewards", "gift-outline"],
              ["explore", "Explore", "compass-outline"],
            ] as [Section, string, Icon][]
          ).map(([key, label, icon]) => {
            const on = section === key;
            return (
              <Pressable key={key} onPress={() => setSection(key)} style={[styles.segItem, on && styles.segOn]}>
                <Ionicons name={icon} size={15} color={on ? colors.night : colors.gold} />
                <Text style={[styles.segText, on && { color: colors.night }]}>{label}</Text>
                {key === "rewards" && fresh > 0 && !on ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          })}
        </View>

        {section === "play" ? (
          <>
            <Pressable onPress={() => navigation.navigate("Trivia")}>
              <LinearGradient colors={[colors.burgundy, colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.trivia}>
                <View style={styles.triviaBadge}>
                  <Ionicons name="sparkles" size={12} color={colors.night} />
                  <Text style={styles.triviaBadgeText}>{store.triviaPlayedToday ? "PLAYED TODAY" : `EARN UP TO ${TRIVIA_LENGTH * COINS_PER_CORRECT} COINS`}</Text>
                </View>
                <Text style={styles.triviaTitle}>Trip trivia</Text>
                <Text style={styles.triviaLine}>{TRIVIA_LENGTH} quick questions on Telangana, cricket, movies, and more. Every right answer earns {COINS_PER_CORRECT} coins.</Text>
                <View style={styles.triviaCta}>
                  <Text style={styles.triviaCtaText}>{store.triviaPlayedToday ? "Play for fun" : "Play now"}</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.night} />
                </View>
                <Ionicons name="help-circle" size={120} color="rgba(214,160,0,0.12)" style={styles.triviaMark} />
              </LinearGradient>
            </Pressable>

            <Text style={[styles.kicker, styles.sectionGap]}>QUICK GAMES · WORK OFFLINE</Text>
            <View style={{ gap: 10 }}>
              {games.map((game) => {
                const best = store.bests[game.id];
                return (
                  <Pressable key={game.id} onPress={() => navigation.navigate("Game", { id: game.id })} style={({ pressed }) => [styles.game, pressed && { borderColor: colors.gold }]}>
                    <View style={styles.gameIcon}>
                      <Ionicons name={game.icon} size={24} color={colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gameTitle}>{game.title}</Text>
                      <Text style={styles.gameLine}>{game.line}</Text>
                      {best !== undefined ? <Text style={styles.gameBest}>{game.best(best)}</Text> : null}
                    </View>
                    <Ionicons name="play-circle" size={30} color={colors.gold} />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.safe}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.gold} />
              <Text style={styles.safeText}>On a bike? Hold on with both hands and play once you reach.</Text>
            </View>
          </>
        ) : section === "rewards" ? (
          <>
            <LinearGradient colors={[colors.plum, colors.inkwell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wallet}>
              <View style={styles.walletRow}>
                <View style={[styles.coin, styles.coinBig]}>
                  <Text style={[styles.coinR, { fontSize: 22 }]}>R</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kicker}>ROVEYA COINS</Text>
                  <Text style={styles.coinsBig}>{store.coins.toLocaleString("en-IN")}</Text>
                </View>
              </View>
              <View style={styles.meter}>
                <View style={[styles.meterFill, { width: `${Math.min(100, ((store.coins % REDEEM_COINS) / REDEEM_COINS) * 100)}%` }]} />
              </View>
              <Text style={styles.walletLine}>
                {REDEEM_COINS} coins = ₹{REDEEM_VALUE} in your wallet · Wallet ₹{store.wallet}
              </Text>
              <Pressable onPress={redeem} style={[styles.redeem, store.coins < REDEEM_COINS && { opacity: 0.45 }]}>
                <Text style={styles.redeemText}>Redeem {REDEEM_COINS} coins</Text>
              </Pressable>
            </LinearGradient>
            {note ? <Text style={styles.note}>{note}</Text> : null}

            <Text style={[styles.kicker, styles.sectionGap]}>SCRATCH CARDS · {fresh} NEW</Text>
            <View style={styles.cards}>
              {store.cards.map((card) => (
                <Pressable key={card.id} onPress={() => !card.scratched && setScratching(card)} style={styles.cardWrap}>
                  {card.scratched ? (
                    <View style={[styles.scratchCard, styles.scratched]}>
                      <Ionicons name={card.reward.kind === "cash" ? "wallet" : "sparkles"} size={22} color={colors.gold} />
                      <Text style={styles.wonValue}>{rewardLabel(card.reward)}</Text>
                      <Text style={styles.cardFrom} numberOfLines={1}>{card.from}</Text>
                    </View>
                  ) : (
                    <LinearGradient colors={[colors.goldBright, colors.gold, "#9C7410"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scratchCard}>
                      <Ionicons name="gift" size={26} color={colors.night} />
                      <Text style={styles.scratchMe}>Scratch me</Text>
                      <Text style={[styles.cardFrom, { color: "rgba(18,6,13,0.7)" }]} numberOfLines={1}>{card.from}</Text>
                    </LinearGradient>
                  )}
                </Pressable>
              ))}
            </View>
            <Text style={styles.fine}>Every completed ride, taxipool, and parcel adds a new card.</Text>

            <Text style={[styles.kicker, styles.sectionGap]}>REFER A FRIEND</Text>
            <View style={styles.refer}>
              <Text style={styles.referTitle}>Give ₹{REFERRAL_BONUS}, get ₹{REFERRAL_BONUS}.</Text>
              <Text style={styles.referLine}>Your friend gets ₹{REFERRAL_BONUS} on their first ride. You get ₹{REFERRAL_BONUS} when they finish it.</Text>
              <View style={styles.codeBox}>
                <Text style={styles.code}>{referral}</Text>
              </View>
              <View style={styles.steps}>
                {["Share your code", "Friend rides with ROVEYA", `You both get ₹${REFERRAL_BONUS}`].map((label, index) => (
                  <View key={label} style={styles.stepItem}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{label}</Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={() => void share()} style={styles.shareBtn}>
                <Ionicons name="share-social" size={17} color={colors.night} />
                <Text style={styles.shareText}>Share invite</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.lead}>Heading out on a taxipool? Here is what to see and eat when you arrive.</Text>
            <View style={{ gap: 10 }}>
              {guides.map((guide) => {
                const expanded = open === guide.cityId;
                const city = cityById(guide.cityId);
                return (
                  <View key={guide.cityId} style={[styles.guide, expanded && { borderColor: colors.gold }]}>
                    <Pressable onPress={() => setOpen(expanded ? null : guide.cityId)} style={styles.guideHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guideCity}>{guide.name}</Text>
                        <Text style={styles.guideTag}>{guide.tagline}</Text>
                      </View>
                      {city ? <Text style={styles.guideFare}>₹{city.farePerSeat}<Text style={styles.guidePer}> / seat</Text></Text> : null}
                      <Ionicons name={expanded ? "remove" : "add"} size={20} color={colors.gold} />
                    </Pressable>
                    {expanded ? (
                      <View style={styles.guideBody}>
                        <Text style={styles.guideLabel}>SEE</Text>
                        {guide.see.map((spot) => (
                          <Spot key={spot.name} {...spot} />
                        ))}
                        <Text style={[styles.guideLabel, { marginTop: 8 }]}>EAT</Text>
                        {guide.eat.map((spot) => (
                          <Spot key={spot.name} {...spot} />
                        ))}
                        <View style={styles.know}>
                          <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
                          <Text style={styles.knowText}>{guide.know}</Text>
                        </View>
                        <Pressable onPress={() => navigation.navigate("Pool")} style={styles.bookSeat}>
                          <Text style={styles.bookSeatText}>Seats to {guide.name}</Text>
                          <Ionicons name="arrow-forward" size={15} color={colors.night} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      <ScratchModal card={scratching} onClose={() => setScratching(null)} onReveal={(card) => store.revealCard(card.id)} />
    </View>
  );
}

function Spot({ name, line, icon }: { name: string; line: string; icon: Icon }) {
  return (
    <View style={styles.spot}>
      <View style={styles.spotIcon}>
        <Ionicons name={icon} size={15} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.spotName}>{name}</Text>
        <Text style={styles.spotLine}>{line}</Text>
      </View>
    </View>
  );
}

const GRID = 10;
const MAX_SIZE = 260;

function mix(from: number[], to: number[], t: number) {
  return `rgb(${from.map((value, i) => Math.round(value + (to[i] - value) * t)).join(",")})`;
}

const coverShades = Array.from({ length: GRID * 2 - 1 }, (_, i) => mix([232, 192, 82], [168, 124, 0], i / (GRID * 2 - 2)));

function ScratchModal({ card, onClose, onReveal }: { card: ScratchCard | null; onClose: () => void; onReveal: (card: ScratchCard) => void }) {
  const [cleared, setCleared] = useState<boolean[]>(() => Array(GRID * GRID).fill(false));
  const [done, setDone] = useState(false);
  const size = Math.min(MAX_SIZE, useScreenWidth() - 88);
  const cellRef = useRef(size / GRID);
  cellRef.current = size / GRID;
  const surface = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cardRef = useRef(card);
  cardRef.current = card;
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const doneRef = useRef(false);

  const reset = () => {
    setCleared(Array(GRID * GRID).fill(false));
    setDone(false);
    doneRef.current = false;
  };

  const finish = () => {
    if (doneRef.current || !cardRef.current) return;
    doneRef.current = true;
    setDone(true);
    revealRef.current(cardRef.current);
  };

  const rub = (pageX: number, pageY: number) => {
    const x = pageX - origin.current.x;
    const y = pageY - origin.current.y;
    const cell = cellRef.current;
    setCleared((current) => {
      const next = [...current];
      for (let row = 0; row < GRID; row += 1) {
        for (let col = 0; col < GRID; col += 1) {
          const cx = col * cell + cell / 2;
          const cy = row * cell + cell / 2;
          if ((cx - x) ** 2 + (cy - y) ** 2 < (cell * 1.4) ** 2) next[row * GRID + col] = true;
        }
      }
      if (next.filter(Boolean).length > GRID * GRID * 0.55) setTimeout(finish, 0);
      return next;
    });
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { pageX, pageY } = event.nativeEvent;
        surface.current?.measureInWindow((x, y) => {
          origin.current = { x, y };
          rub(pageX, pageY);
        });
      },
      onPanResponderMove: (event) => rub(event.nativeEvent.pageX, event.nativeEvent.pageY),
    }),
  ).current;

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={Boolean(card)} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.kicker}>{done ? "YOU WON" : "SCRATCH TO REVEAL"}</Text>
          <Text style={styles.sheetFrom}>{card?.from}</Text>
          <View ref={surface} style={[styles.surface, { width: size, height: size }]} {...responder.panHandlers}>
            <View style={styles.prize}>
              <Ionicons name={card?.reward.kind === "cash" ? "wallet" : "sparkles"} size={40} color={colors.gold} />
              <Text style={styles.prizeValue}>{card ? rewardLabel(card.reward) : ""}</Text>
              <Text style={styles.prizeLine}>{card?.reward.kind === "cash" ? "Added to your ROVEYA wallet" : "Added to your coins"}</Text>
            </View>
            {!done ? (
              <View style={[styles.cover, { width: size, height: size }]} pointerEvents="none">
                {cleared.map((off, index) => (
                  <View key={index} style={[{ width: size / GRID, height: size / GRID }, { backgroundColor: coverShades[Math.floor(index / GRID) + (index % GRID)] }, off && { opacity: 0 }]} />
                ))}
                {cleared.filter(Boolean).length < 12 ? (
                  <View style={styles.coverLabel}>
                    <Ionicons name="finger-print" size={30} color={colors.night} />
                    <Text style={styles.coverText}>Rub here</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
          {!done ? (
            <Pressable onPress={finish}>
              <Text style={styles.revealAll}>Reveal it all</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={close} style={styles.closeBtn}>
            <Text style={styles.closeText}>{done ? "Collect" : "Later"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  hello: { marginTop: 4, color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  coinChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 14, height: 40, borderRadius: 20, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.gold },
  coin: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  coinBig: { width: 52, height: 52, borderRadius: 26 },
  coinR: { color: colors.night, fontFamily: type.bold, fontSize: 13, lineHeight: 16 },
  coinText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  segment: { marginTop: 18, marginBottom: 18, flexDirection: "row", padding: 4, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  segItem: { flex: 1, height: 38, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  segOn: { backgroundColor: colors.gold },
  segText: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 13 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.goldBright, marginLeft: 2 },
  sectionGap: { marginTop: 24, marginBottom: 10 },
  lead: { marginBottom: 14, color: colors.muted, fontFamily: type.body, fontSize: 14, lineHeight: 20 },
  trivia: { borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  triviaBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  triviaBadgeText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 1 },
  triviaTitle: { marginTop: 12, color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  triviaLine: { marginTop: 6, width: "82%", color: colors.muted, fontFamily: type.body, fontSize: 13, lineHeight: 19 },
  triviaCta: { marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.gold, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  triviaCtaText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 13.5 },
  triviaMark: { position: "absolute", right: -18, bottom: -22 },
  game: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  gameIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  gameTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  gameLine: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5, lineHeight: 17 },
  gameBest: { marginTop: 4, color: colors.gold, fontFamily: type.label, fontSize: 11.5 },
  safe: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 18, backgroundColor: "rgba(214,160,0,0.07)", borderWidth: 1, borderColor: colors.line },
  safeText: { flex: 1, color: colors.muted, fontFamily: type.body, fontSize: 12.5, lineHeight: 18 },
  wallet: { borderRadius: 24, padding: 18, borderWidth: 1, borderColor: colors.line },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  coinsBig: { marginTop: 2, color: colors.cream, fontFamily: type.labelStrong, fontSize: 34, lineHeight: 40 },
  meter: { marginTop: 16, height: 6, borderRadius: 3, backgroundColor: "rgba(246,241,220,0.12)", overflow: "hidden" },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  walletLine: { marginTop: 8, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  redeem: { marginTop: 14, height: 46, borderRadius: 16, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  redeemText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 14.5 },
  note: { marginTop: 10, color: colors.gold, fontFamily: type.label, fontSize: 13, textAlign: "center" },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cardWrap: { width: "48.5%" },
  scratchCard: { height: 132, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 6, padding: 12, overflow: "hidden" },
  scratched: { backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  scratchMe: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15 },
  wonValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 16 },
  cardFrom: { color: colors.faint, fontFamily: type.body, fontSize: 11.5 },
  fine: { marginTop: 10, color: colors.faint, fontFamily: type.body, fontSize: 12, textAlign: "center" },
  refer: { padding: 18, borderRadius: 24, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  referTitle: { color: colors.cream, fontFamily: type.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  referLine: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 13, lineHeight: 19 },
  codeBox: { marginTop: 14, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.gold, alignItems: "center", backgroundColor: colors.night },
  code: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 20, letterSpacing: 2 },
  steps: { marginTop: 14, gap: 10 },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.gold, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 12 },
  stepText: { color: colors.cream, fontFamily: type.label, fontSize: 13.5 },
  shareBtn: { marginTop: 16, height: 50, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  shareText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15 },
  guide: { borderRadius: 22, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  guideHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  guideCity: { color: colors.cream, fontFamily: type.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
  guideTag: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  guideFare: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 14 },
  guidePer: { color: colors.faint, fontFamily: type.body, fontSize: 11 },
  guideBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 14 },
  guideLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 2 },
  spot: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  spotIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  spotName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  spotLine: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5, lineHeight: 18 },
  know: { marginTop: 6, flexDirection: "row", gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.night },
  knowText: { flex: 1, color: colors.muted, fontFamily: type.body, fontSize: 12.5, lineHeight: 18 },
  bookSeat: { marginTop: 4, height: 46, borderRadius: 16, backgroundColor: colors.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bookSeatText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: "rgba(8,2,6,0.82)", alignItems: "center", justifyContent: "center", padding: 20 },
  sheet: { width: "100%", maxWidth: 340, alignItems: "center", padding: 20, borderRadius: 28, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  sheetFrom: { marginTop: 4, marginBottom: 16, color: colors.cream, fontFamily: type.display, fontSize: 18 },
  surface: { borderRadius: 22, overflow: "hidden", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  prize: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  prizeValue: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 28, textAlign: "center" },
  prizeLine: { color: colors.faint, fontFamily: type.body, fontSize: 13, textAlign: "center" },
  cover: { position: "absolute", top: 0, left: 0, flexDirection: "row", flexWrap: "wrap" },
  coverLabel: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 6 },
  coverText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 18 },
  revealAll: { marginTop: 14, color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  closeBtn: { marginTop: 14, alignSelf: "stretch", height: 48, borderRadius: 16, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 15 },
});
