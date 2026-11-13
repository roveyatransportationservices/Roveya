import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DeskChat, type Topic } from "../components/DeskChat";
import type { CaptainStack } from "../navigation";

const topics: Topic[] = [
  { label: "Payout or settlement", hint: "Tell us the settlement dates or amount you are asking about." },
  { label: "Trip or booking", hint: "Add the trip code (RVT-…) or the traveller's PNR." },
  { label: "Documents and approval", hint: "Which document, and what the app shows." },
  { label: "Car or seat names", hint: "What you want to change on your car." },
  { label: "Traveller issue", hint: "What happened, and on which trip." },
  { label: "App problem", hint: "What you tapped and what went wrong." },
  { label: "Something else" },
];

export function SupportScreen({ navigation }: NativeStackScreenProps<CaptainStack, "Support">) {
  return <DeskChat topics={topics} email="captains@roveya.com" onBack={() => navigation.goBack()} />;
}
