import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CoverPhoto } from "../components/CoverPhoto";
import { DESK_PHONE, FlowCta, FlowGhost, FlowSum, StepShell, type FlowIcon, type TrailItem } from "../components/StepShell";
import { inr } from "../geo";
import {
  addDays,
  cityById,
  clock,
  dayLabel,
  departures,
  duration,
  journeyMinutes,
  monthLabel,
  poolCities,
  popularRoutes,
  PREMIUM_EXTRA,
  SEATS_PER_CAR,
  startOfDay,
  type Departure,
  type PoolCity,
} from "../pool";
import { useStore } from "../store";
import { colors, type } from "../theme";
import type { CustomerStack } from "../navigation";
import type { PayMethod, PoolBooking } from "../types";

type Props = NativeStackScreenProps<CustomerStack, "PoolFlow">;
type Sort = "earliest" | "seats" | "rating";
type Icon = FlowIcon;

const steps = ["Boarding", "Destination", "Seats", "Travel day", "Taxipool", "Confirm"];
const CALENDAR_DAYS = 28;
const weekHead = ["M", "T", "W", "T", "F", "S", "S"];

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function PoolFlowScreen({ navigation }: Props) {
  const store = useStore();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [step, setStep] = useState(0);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [seats, setSeats] = useState(1);
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("earliest");
  const [payment, setPayment] = useState<PayMethod>("cash");
  const [booked, setBooked] = useState<PoolBooking | null>(null);
  const from = cityById(fromId);
  const to = cityById(toId);
  const travelDay = dayIndex === null ? null : addDays(today, dayIndex);

  const list = useMemo(() => {
    if (!from || !to || !travelDay) return [];
    const all = departures(from, to, travelDay, 1);
    if (sort === "seats") return [...all].sort((a, b) => b.seatsLeft - a.seatsLeft || a.departAt - b.departAt);
    if (sort === "rating") return [...all].sort((a, b) => b.rating - a.rating || a.departAt - b.departAt);
    return all;
  }, [fromId, toId, dayIndex, sort]);

  const picked = list.find((item) => item.id === pickedId) ?? null;
  const pickedFits = Boolean(picked && picked.seatsLeft >= seats);
  const fare = picked ? picked.farePerSeat : to?.farePerSeat ?? 0;
  const total = fare * seats;
  const walletShort = store.wallet < total;

  useEffect(() => {
    if (walletShort && payment === "wallet") setPayment("cash");
  }, [walletShort, payment]);

  const go = (next: number) => setStep(next);

  const back = () => {
    if (booked || step === 0) navigation.goBack();
    else go(step - 1);
  };

  const pickFrom = (city: PoolCity) => {
    setFromId(city.id);
    if (toId === city.id) setToId(null);
    setTimeout(() => go(1), 200);
  };

  const pickTo = (city: PoolCity) => {
    setToId(city.id);
    setTimeout(() => go(2), 200);
  };

  const quick = [
    { label: "Today", index: 0 },
    { label: "Tomorrow", index: 1 },
    { label: dayLabel(addDays(today, 2)), index: 2 },
  ];

  const confirm = () => {
    if (!from || !to || !picked) return;
    if (payment === "wallet" && !store.payFromWallet(total, `Taxipool · ${from.name} to ${to.name}`)) return;
    const booking: PoolBooking = {
      id: `RVP-${String(Date.now()).slice(-5)}`,
      code: String(1000 + Math.floor(Math.random() * 9000)),
      from: from.name,
      to: to.name,
      boarding: from.point,
      dropPoint: to.point,
      departAt: picked.departAt,
      arriveAt: picked.arriveAt,
      seats,
      farePerSeat: picked.farePerSeat,
      total,
      payment,
      captain: picked.captain,
      car: picked.car,
      plate: picked.plate,
    };
    store.bookPool(booking);
    setBooked(booking);
  };

  const canContinue = [Boolean(from), Boolean(to), seats > 0, dayIndex !== null, pickedFits, pickedFits][step];
  const ctaLabel = ["Continue", "Continue", "Continue", "Show taxipools", "Continue", `Confirm · ${inr(total)}`][step];
  const onCta = () => {
    if (!canContinue) return;
    if (step === steps.length - 1) confirm();
    else go(step + 1);
  };

  const trail: TrailItem[] = [];
  if (from) trail.push({ step: 0, icon: "radio-button-on", label: from.name });
  if (to) trail.push({ step: 1, icon: "location", label: to.name });
  if (step > 2) trail.push({ step: 2, icon: "person", label: plural(seats, "seat") });
  if (step > 3 && travelDay) trail.push({ step: 3, icon: "calendar", label: dayLabel(travelDay) });
  if (step > 4 && picked) trail.push({ step: 4, icon: "car-sport", label: `${clock(picked.departAt)} · ${picked.captain.split(" ")[0]}` });

  return (
    <StepShell
      kicker="TAXIPOOL · CITY TO CITY"
      steps={steps}
      step={step}
      doneLabel={booked ? "Booking confirmed" : null}
      trail={trail}
      onBack={back}
      onTrail={go}
      footer={
        booked ? (
          <>
            <FlowGhost label="Call desk" icon="call-outline" onPress={() => void Linking.openURL(DESK_PHONE)} />
            <FlowCta label="Done" icon="checkmark" onPress={() => navigation.goBack()} />
          </>
        ) : (
          <>
            {step >= 2 && step <= 4 && to ? <FlowSum value={inr(total)} sub={plural(seats, "seat")} /> : null}
            <FlowCta label={ctaLabel} icon={step === steps.length - 1 ? "checkmark" : "arrow-forward"} disabled={!canContinue} onPress={onCta} />
          </>
        )
      }
    >
          {booked ? (
            <Booked booking={booked} name={store.session?.name ?? ""} />
          ) : step === 0 ? (
            <>
              <CoverPhoto source={require("../../assets/cust-pool-group.jpg")} ratio={0.75} focus={0.42} style={styles.hero}>
                <LinearGradient colors={["rgba(18,6,13,0.94)", "rgba(18,6,13,0.55)", "rgba(18,6,13,0.05)"]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fillAbs} />
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>A seat of your own,{"\n"}city to city.</Text>
                  <Text style={styles.heroLine}>Four riders a car. The fare is shown before you leave.</Text>
                </View>
              </CoverPhoto>
              <Text style={styles.title}>Where will you board?</Text>
              <Text style={styles.lead}>Pick the city you start from.</Text>
              <View style={styles.card}>
                {poolCities.map((city, index) => (
                  <CityRow key={city.id} city={city} last={index === poolCities.length - 1} selected={fromId === city.id} sub={`Board at ${city.point}`} onPress={() => pickFrom(city)} />
                ))}
              </View>
              <Text style={[styles.kicker, styles.sectionGap]}>POPULAR ROUTES</Text>
              <View style={styles.wrap}>
                {popularRoutes.map(([a, b]) => (
                  <Pressable
                    key={`${a}-${b}`}
                    onPress={() => {
                      setFromId(a);
                      setToId(b);
                      go(2);
                    }}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipOn]}
                  >
                    <Text style={styles.chipText}>{cityById(a)?.name}</Text>
                    <Ionicons name="arrow-forward" size={12} color={colors.gold} />
                    <Text style={styles.chipText}>{cityById(b)?.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : step === 1 && from ? (
            <>
              <Text style={styles.title}>Where are you going?</Text>
              <Text style={styles.lead}>From {from.name}. Every fare is per seat.</Text>
              <View style={styles.card}>
                {poolCities
                  .filter((city) => city.id !== from.id)
                  .map((city, index, all) => (
                    <CityRow
                      key={city.id}
                      city={city}
                      last={index === all.length - 1}
                      selected={toId === city.id}
                      sub={`Drop at ${city.point}`}
                      meta={`About ${duration(journeyMinutes(from, city))}`}
                      fare={city.farePerSeat}
                      onPress={() => pickTo(city)}
                    />
                  ))}
              </View>
            </>
          ) : step === 2 ? (
            <>
              <Text style={styles.title}>How many seats?</Text>
              <Text style={styles.lead}>Each seat is yours for the whole journey.</Text>
              <View style={[styles.card, styles.seatCard]}>
                <View style={styles.stepper}>
                  <Pressable accessibilityLabel="One seat less" disabled={seats <= 1} onPress={() => setSeats((n) => Math.max(1, n - 1))} style={({ pressed }) => [styles.stepBtn, seats <= 1 && styles.off, pressed && { backgroundColor: colors.plum }]}>
                    <Ionicons name="remove" size={22} color={colors.cream} />
                  </Pressable>
                  <View style={styles.countBox}>
                    <Text style={styles.count}>{seats}</Text>
                    <Text style={styles.countLabel}>{seats === 1 ? "SEAT" : "SEATS"}</Text>
                  </View>
                  <Pressable accessibilityLabel="One seat more" disabled={seats >= SEATS_PER_CAR} onPress={() => setSeats((n) => Math.min(SEATS_PER_CAR, n + 1))} style={({ pressed }) => [styles.stepBtn, seats >= SEATS_PER_CAR && styles.off, pressed && { backgroundColor: colors.plum }]}>
                    <Ionicons name="add" size={22} color={colors.cream} />
                  </Pressable>
                </View>
                <View style={styles.seatRow}>
                  {Array.from({ length: SEATS_PER_CAR }, (_, index) => {
                    const on = index < seats;
                    return (
                      <Pressable key={index} accessibilityLabel={plural(index + 1, "seat")} onPress={() => setSeats(index + 1)} style={[styles.seat, on && styles.seatOn]}>
                        <Ionicons name={on ? "person" : "person-outline"} size={20} color={on ? colors.night : colors.faint} />
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.seatNote}>A ROVEYA car carries four riders.</Text>
              </View>
              <View style={[styles.card, styles.fareCard]}>
                <FareLine label="Fare per seat" value={inr(to?.farePerSeat ?? 0)} />
                <FareLine label="Seats" value={`× ${seats}`} />
                <View style={styles.rule} />
                <View style={styles.fareTotalRow}>
                  <Text style={styles.fareTotalLabel}>Total</Text>
                  <Text style={styles.fareTotal}>{inr((to?.farePerSeat ?? 0) * seats)}</Text>
                </View>
                <Text style={styles.fineNote}>Premium cars add {inr(PREMIUM_EXTRA)} a seat.</Text>
              </View>
            </>
          ) : step === 3 ? (
            <>
              <Text style={styles.title}>When do you travel?</Text>
              <Text style={styles.lead}>Pick the day of your drop. One way, one day.</Text>
              <View style={styles.wrap}>
                {quick.map((item) => {
                  const on = dayIndex === item.index;
                  return (
                    <Pressable key={item.label} onPress={() => setDayIndex(item.index)} style={({ pressed }) => [styles.chip, (on || pressed) && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.night }]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Calendar today={today} selected={dayIndex} onTap={setDayIndex} />
              {from && to ? (
                <View style={[styles.dayBox, travelDay && { borderColor: colors.gold }]}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="calendar" size={16} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayBoxLabel}>ONE WAY · {from.name.toUpperCase()} TO {to.name.toUpperCase()}</Text>
                    <Text style={styles.dayBoxValue}>{travelDay ? dayLabel(travelDay) : "Pick your travel day"}</Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : step === 4 && from && to && travelDay ? (
            <>
              <Text style={styles.title}>Choose your taxipool</Text>
              <Text style={styles.lead}>
                {list.filter((item) => item.seatsLeft >= seats).length} with {plural(seats, "seat")} open · {dayLabel(travelDay)}
              </Text>
              <View style={[styles.wrap, { marginBottom: 14 }]}>
                {(
                  [
                    ["earliest", "Earliest"],
                    ["seats", "Most seats"],
                    ["rating", "Top rated"],
                  ] as [Sort, string][]
                ).map(([key, label]) => (
                  <Pressable key={key} onPress={() => setSort(key)} style={[styles.chip, sort === key && styles.chipOn]}>
                    <Text style={[styles.chipText, sort === key && { color: colors.night }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {list.length ? (
                <View style={{ gap: 12 }}>
                  {list.map((item) => (
                    <PoolCard key={item.id} item={item} from={from} to={to} seats={seats} selected={item.id === pickedId} onPress={() => setPickedId(item.id)} />
                  ))}
                </View>
              ) : (
                <View style={[styles.card, styles.empty]}>
                  <Ionicons name="calendar-outline" size={26} color={colors.gold} />
                  <Text style={styles.emptyTitle}>Every car on this day is booked.</Text>
                  <Text style={styles.emptyLine}>Pick another day to see more taxipools.</Text>
                  <Pressable onPress={() => go(3)} style={styles.emptyBtn}>
                    <Text style={styles.emptyBtnText}>Change day</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : step === 5 && from && to && picked ? (
            <>
              <Text style={styles.title}>Review and confirm</Text>
              <Text style={styles.lead}>Check the details, then book your seats.</Text>
              <Ticket item={picked} from={from} to={to} />
              <View style={[styles.card, styles.passenger]}>
                <View style={styles.passIcon}>
                  <Ionicons name="person" size={16} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passName}>{store.session?.name || "ROVEYA rider"}</Text>
                  <Text style={styles.passSub}>+91 {store.session?.phone} · {plural(seats, "seat")}</Text>
                </View>
              </View>
              <View style={[styles.card, styles.fareCard]}>
                <FareLine label="Fare per seat" value={inr(picked.farePerSeat)} />
                <FareLine label="Seats" value={`× ${seats}`} />
                <View style={styles.rule} />
                <View style={styles.fareTotalRow}>
                  <Text style={styles.fareTotalLabel}>Total</Text>
                  <Text style={styles.fareTotal}>{inr(total)}</Text>
                </View>
              </View>
              <Text style={[styles.kicker, styles.sectionGap]}>PAY WITH</Text>
              <View style={styles.card}>
                <PayRow icon="cash-outline" title="Cash at boarding" sub="Pay your captain before you leave" selected={payment === "cash"} onPress={() => setPayment("cash")} />
                <PayRow
                  icon="wallet-outline"
                  title="ROVEYA Wallet"
                  sub={walletShort ? `Balance ${inr(store.wallet)} · add ${inr(total - store.wallet)} to use it` : `Balance ${inr(store.wallet)}`}
                  selected={payment === "wallet"}
                  disabled={walletShort}
                  last
                  onPress={() => setPayment("wallet")}
                />
              </View>
            </>
          ) : null}
    </StepShell>
  );
}

function CityRow({ city, sub, meta, fare, selected, last, onPress }: { city: PoolCity; sub: string; meta?: string; fare?: number; selected: boolean; last: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, (pressed || selected) && { backgroundColor: colors.mist }]}>
      <View style={[styles.rowIcon, selected && { borderColor: colors.gold }]}>
        <Ionicons name={selected ? "location" : "location-outline"} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle}>{city.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
        {meta ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={11} color={colors.gold} />
            <Text style={styles.metaText}>{meta}</Text>
          </View>
        ) : null}
      </View>
      {fare ? (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.rowFare}>{inr(fare)}</Text>
          <Text style={styles.rowPer}>/ seat</Text>
        </View>
      ) : null}
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Ionicons name="checkmark" size={13} color={colors.night} /> : null}</View>
    </Pressable>
  );
}

function FareLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fareLine}>
      <Text style={styles.fareLabel}>{label}</Text>
      <Text style={styles.fareValue}>{value}</Text>
    </View>
  );
}

function Calendar({ today, selected, onTap }: { today: Date; selected: number | null; onTap: (index: number) => void }) {
  const lead = (today.getDay() + 6) % 7;
  const last = addDays(today, CALENDAR_DAYS - 1);
  const title = today.getMonth() === last.getMonth() ? monthLabel(today) : `${monthLabel(today).split(" ")[0]} – ${monthLabel(last)}`;
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: CALENDAR_DAYS }, (_, index) => index)];
  while (cells.length % 7) cells.push(null);
  return (
    <View style={[styles.card, styles.calendar]}>
      <Text style={styles.calTitle}>{title}</Text>
      <View style={styles.calRow}>
        {weekHead.map((day, index) => (
          <Text key={index} style={styles.calHead}>{day}</Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={styles.calRow}>
          {cells.slice(week * 7, week * 7 + 7).map((index, column) => {
            if (index === null) return <View key={`b${column}`} style={styles.calCell} />;
            const date = addDays(today, index);
            const edge = index === selected;
            return (
              <Pressable key={index} onPress={() => onTap(index)} style={styles.calCell}>
                <View style={[styles.dayDot, edge && styles.dayEdge]}>
                  {date.getDate() === 1 ? <Text style={[styles.dayMonth, edge && { color: colors.night }]}>{monthLabel(date).slice(0, 3).toUpperCase()}</Text> : null}
                  <Text style={[styles.dayText, edge && styles.dayTextEdge]}>{date.getDate()}</Text>
                </View>
                {index === 0 && !edge ? <View style={styles.todayMark} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function SeatDots({ open }: { open: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: SEATS_PER_CAR }, (_, index) => (
        <View key={index} style={[styles.seatDot, index < SEATS_PER_CAR - open ? styles.seatTaken : styles.seatOpen]} />
      ))}
    </View>
  );
}

function PoolCard({ item, from, to, seats, selected, onPress }: { item: Departure; from: PoolCity; to: PoolCity; seats: number; selected: boolean; onPress: () => void }) {
  const fits = item.seatsLeft >= seats;
  const overnight = new Date(item.arriveAt).getDate() !== new Date(item.departAt).getDate();
  return (
    <Pressable disabled={!fits} onPress={onPress} style={({ pressed }) => [styles.pool, selected && styles.poolOn, !fits && { opacity: 0.45 }, pressed && { backgroundColor: colors.mist }]}>
      <View style={styles.poolTop}>
        <Text style={styles.poolDate}>{dayLabel(item.departAt).toUpperCase()}</Text>
        {item.premium ? (
          <View style={styles.premium}>
            <Ionicons name="star" size={10} color={colors.night} />
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {selected ? (
          <View style={[styles.radio, styles.radioOn]}>
            <Ionicons name="checkmark" size={13} color={colors.night} />
          </View>
        ) : null}
      </View>
      <View style={styles.times}>
        <View>
          <Text style={styles.time}>{clock(item.departAt)}</Text>
          <Text style={styles.timeCity}>{from.name}</Text>
        </View>
        <View style={styles.timeMid}>
          <View style={styles.timeLine} />
          <Text style={styles.timeDur}>{duration(item.minutes)}</Text>
          <View style={styles.timeLine} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.time}>
            {clock(item.arriveAt)}
            {overnight ? <Text style={styles.plusDay}> +1</Text> : null}
          </Text>
          <Text style={styles.timeCity}>{to.name}</Text>
        </View>
      </View>
      <View style={styles.hair} />
      <View style={styles.captainRow}>
        <Image source={item.photo} style={styles.photo} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.captain}>{item.captain}</Text>
          <Text style={styles.captainSub} numberOfLines={1}>
            <Text style={{ color: colors.gold }}>★ {item.rating.toFixed(2)}</Text> · {item.trips.toLocaleString("en-IN")} trips · {item.car}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.poolFare}>{inr(item.farePerSeat)}</Text>
          <Text style={styles.rowPer}>/ seat</Text>
        </View>
      </View>
      <View style={styles.poolBottom}>
        <SeatDots open={item.seatsLeft} />
        <Text style={[styles.seatsText, !fits && { color: colors.faint }]}>
          {item.seatsLeft === 0 ? "Full" : fits ? `${item.seatsLeft} of ${SEATS_PER_CAR} seats open` : `Only ${plural(item.seatsLeft, "seat")} open`}
        </Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="snow-outline" size={14} color={colors.faint} />
        <Ionicons name="water-outline" size={14} color={colors.faint} />
        <Ionicons name="briefcase-outline" size={14} color={colors.faint} />
      </View>
    </Pressable>
  );
}

function Ticket({ item, from, to }: { item: Departure; from: PoolCity; to: PoolCity }) {
  return (
    <View style={styles.ticket}>
      <View style={styles.poolTop}>
        <Text style={styles.poolDate}>{dayLabel(item.departAt).toUpperCase()}</Text>
        {item.premium ? (
          <View style={styles.premium}>
            <Ionicons name="star" size={10} color={colors.night} />
            <Text style={styles.premiumText}>PREMIUM</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.stops}>
        <View style={styles.stopRail}>
          <View style={[styles.stopDot, { backgroundColor: colors.gold }]} />
          <View style={styles.stopLine} />
          <View style={[styles.stopDot, { backgroundColor: colors.burgundy, borderColor: colors.goldBright }]} />
        </View>
        <View style={{ flex: 1, gap: 18 }}>
          <View>
            <Text style={styles.stopTime}>{clock(item.departAt)} · {from.name}</Text>
            <Text style={styles.stopPoint}>Board at {from.point}</Text>
          </View>
          <Text style={styles.stopDur}>{duration(item.minutes)} on the road</Text>
          <View>
            <Text style={styles.stopTime}>{clock(item.arriveAt)} · {to.name}</Text>
            <Text style={styles.stopPoint}>Drop at {to.point}</Text>
          </View>
        </View>
      </View>
      <View style={styles.tear}>
        <View style={[styles.notch, { left: -12 }]} />
        <View style={styles.dash} />
        <View style={[styles.notch, { right: -12 }]} />
      </View>
      <View style={styles.captainRow}>
        <Image source={item.photo} style={styles.photo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.captain}>Captain {item.captain}</Text>
          <Text style={styles.captainSub} numberOfLines={1}>
            <Text style={{ color: colors.gold }}>★ {item.rating.toFixed(2)}</Text> · {item.car} · {item.plate}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PayRow({ icon, title, sub, selected, disabled, last, onPress }: { icon: Icon; title: string; sub: string; selected: boolean; disabled?: boolean; last?: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, (pressed || selected) && { backgroundColor: colors.mist }, disabled && { opacity: 0.5 }]}>
      <View style={[styles.rowIcon, selected && { borderColor: colors.gold }]}>
        <Ionicons name={icon} size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Ionicons name="checkmark" size={13} color={colors.night} /> : null}</View>
    </Pressable>
  );
}

function Booked({ booking, name }: { booking: PoolBooking; name: string }) {
  return (
    <>
      <View style={styles.doneTop}>
        <View style={styles.doneRing}>
          <View style={styles.doneDisc}>
            <Ionicons name="checkmark" size={36} color={colors.night} />
          </View>
        </View>
        <Text style={[styles.kicker, { marginTop: 18 }]}>BOOKING CONFIRMED</Text>
        <Text style={[styles.title, { textAlign: "center", marginTop: 6 }]}>Your seats are booked.</Text>
        <Text style={[styles.lead, { textAlign: "center" }]}>
          {plural(booking.seats, "seat")} to {booking.to} on {dayLabel(booking.departAt)}. Show this code to your captain at boarding.
        </Text>
      </View>
      <View style={styles.ticket}>
        <Text style={[styles.kicker, { textAlign: "center" }]}>BOARDING CODE</Text>
        <Text style={styles.code}>{booking.code.split("").join(" ")}</Text>
        <View style={styles.tear}>
          <View style={[styles.notch, { left: -12 }]} />
          <View style={styles.dash} />
          <View style={[styles.notch, { right: -12 }]} />
        </View>
        <FareLine label="Booking" value={booking.id} />
        <FareLine label="Passenger" value={name || "ROVEYA rider"} />
        <FareLine label="Departs" value={`${clock(booking.departAt)} · ${booking.from}`} />
        <FareLine label="Board at" value={booking.boarding} />
        <FareLine label="Arrives" value={`${clock(booking.arriveAt)} · ${booking.to}`} />
        <FareLine label="Captain" value={booking.captain} />
        <FareLine label="Car" value={`${booking.car} · ${booking.plate}`} />
        <View style={styles.rule} />
        <View style={styles.fareTotalRow}>
          <Text style={styles.fareTotalLabel}>{booking.payment === "wallet" ? "Paid from wallet" : "Pay at boarding"}</Text>
          <Text style={styles.fareTotal}>{inr(booking.total)}</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fillAbs: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  kicker: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  hero: { height: 150, borderRadius: 22, borderWidth: 1, borderColor: colors.line, marginBottom: 22 },
  heroCopy: { position: "absolute", top: 0, bottom: 0, left: 18, width: "64%", justifyContent: "center" },
  heroTitle: { color: colors.cream, fontFamily: type.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
  heroLine: { marginTop: 6, color: colors.muted, fontFamily: type.body, fontSize: 12, lineHeight: 16 },
  title: { color: colors.cream, fontFamily: type.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.4 },
  lead: { marginTop: 6, marginBottom: 16, color: colors.muted, fontFamily: type.body, fontSize: 14, lineHeight: 20 },
  sectionGap: { marginTop: 22, marginBottom: 10 },
  card: { backgroundColor: colors.inkwell, borderRadius: 22, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  rowSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  metaRow: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.muted, fontFamily: type.label, fontSize: 11.5 },
  rowFare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  rowPer: { color: colors.faint, fontFamily: type.body, fontSize: 11 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(246,241,220,0.25)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.cream, fontFamily: type.label, fontSize: 13 },
  seatCard: { paddingVertical: 22, paddingHorizontal: 18, alignItems: "center" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 28 },
  stepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  countBox: { alignItems: "center", minWidth: 80 },
  count: { color: colors.cream, fontFamily: type.label, fontSize: 64, lineHeight: 74 },
  countLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10, letterSpacing: 2.4 },
  seatRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 22 },
  seat: { flex: 1, maxWidth: 60, height: 62, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, alignItems: "center", justifyContent: "center" },
  seatOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  seatNote: { marginTop: 14, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  fareCard: { marginTop: 12, padding: 16, gap: 8 },
  fareLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 2 },
  fareLabel: { color: colors.faint, fontFamily: type.body, fontSize: 13.5 },
  fareValue: { flexShrink: 1, textAlign: "right", color: colors.cream, fontFamily: type.label, fontSize: 13.5 },
  rule: { height: 1, backgroundColor: colors.hairline, marginVertical: 4 },
  fareTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fareTotalLabel: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14 },
  fareTotal: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 22, lineHeight: 28 },
  fineNote: { color: colors.faint, fontFamily: type.body, fontSize: 12 },
  calendar: { marginTop: 14, padding: 14 },
  calTitle: { color: colors.cream, fontFamily: type.display, fontSize: 17, marginBottom: 8, marginLeft: 4 },
  calRow: { flexDirection: "row" },
  calHead: { flex: 1, textAlign: "center", color: colors.faint, fontFamily: type.labelStrong, fontSize: 11, paddingVertical: 6 },
  calCell: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  dayDot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayEdge: { backgroundColor: colors.gold },
  dayText: { color: colors.cream, fontFamily: type.label, fontSize: 14 },
  dayTextEdge: { color: colors.night, fontFamily: type.labelStrong },
  dayMonth: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 7.5, letterSpacing: 1, marginBottom: -2 },
  todayMark: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold },
  dayBox: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  dayBoxLabel: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 9.5, letterSpacing: 1.8 },
  dayBoxValue: { marginTop: 3, color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  pool: { backgroundColor: colors.inkwell, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 14 },
  poolOn: { borderColor: colors.gold, borderWidth: 1.5 },
  poolTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  poolDate: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 10.5, letterSpacing: 1.8 },
  premium: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.gold, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  premiumText: { color: colors.night, fontFamily: type.labelStrong, fontSize: 9, letterSpacing: 1 },
  times: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  time: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 17 },
  plusDay: { color: colors.gold, fontSize: 11 },
  timeCity: { marginTop: 1, color: colors.faint, fontFamily: type.body, fontSize: 12 },
  timeMid: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  timeLine: { flex: 1, height: 1, backgroundColor: colors.line },
  timeDur: { color: colors.muted, fontFamily: type.label, fontSize: 11.5 },
  hair: { height: 1, backgroundColor: colors.hairline, marginVertical: 12 },
  captainRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photo: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line },
  captain: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 14.5 },
  captainSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12 },
  poolFare: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 18, lineHeight: 22 },
  poolBottom: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  dots: { flexDirection: "row", gap: 4 },
  seatDot: { width: 9, height: 11, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  seatTaken: { backgroundColor: "rgba(246,241,220,0.18)" },
  seatOpen: { borderWidth: 1.2, borderColor: colors.gold },
  seatsText: { color: colors.cream, fontFamily: type.label, fontSize: 12 },
  empty: { padding: 24, alignItems: "center", gap: 8 },
  emptyTitle: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15, textAlign: "center" },
  emptyLine: { color: colors.faint, fontFamily: type.body, fontSize: 13, textAlign: "center" },
  emptyBtn: { marginTop: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.gold, paddingHorizontal: 16, paddingVertical: 8 },
  emptyBtnText: { color: colors.gold, fontFamily: type.labelStrong, fontSize: 13 },
  ticket: { backgroundColor: colors.inkwell, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 6 },
  stops: { marginTop: 12, flexDirection: "row", gap: 14 },
  stopRail: { alignItems: "center", paddingVertical: 5, width: 12 },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.night },
  stopLine: { flex: 1, width: 1.5, backgroundColor: colors.line, marginVertical: 3 },
  stopTime: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15.5 },
  stopPoint: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  stopDur: { color: colors.gold, fontFamily: type.displayItalic, fontSize: 13.5 },
  tear: { height: 24, justifyContent: "center", marginHorizontal: -16, marginVertical: 6 },
  dash: { marginHorizontal: 18, borderTopWidth: 1, borderStyle: "dashed", borderColor: "rgba(214,160,0,0.35)" },
  notch: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line },
  passenger: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  passIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  passName: { color: colors.cream, fontFamily: type.labelStrong, fontSize: 15 },
  passSub: { marginTop: 2, color: colors.faint, fontFamily: type.body, fontSize: 12.5 },
  doneTop: { alignItems: "center", paddingTop: 12, paddingBottom: 20 },
  doneRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  doneDisc: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  code: { marginTop: 6, textAlign: "center", color: colors.gold, fontFamily: type.labelStrong, fontSize: 40, lineHeight: 48, letterSpacing: 6 },
  off: { opacity: 0.35 },
});
