import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { FlatList, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, PageTitle, Sheet, Skeleton } from "../components/kit";
import { blogPosts, type BlogPost } from "../content";
import { colors, type } from "../theme";
import type { UserStack } from "../navigation";

type Story = { id: string; title: string; source: string; link: string; publishedAt: number; image: string | null };
type Tab = "news" | "blog";

const topics: { key: string; label: string; query: string }[] = [
  { key: "travel", label: "Travel", query: "Telangana OR \"Andhra Pradesh\" travel tourism" },
  { key: "roads", label: "Roads", query: "Hyderabad Vijayawada highway OR \"NH 65\" road" },
  { key: "pilgrim", label: "Pilgrimage", query: "Tirumala OR Srisailam OR Bhadrachalam darshan" },
  { key: "weather", label: "Weather", query: "Hyderabad OR Telangana weather rain" },
];

const API = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Phones read Google News RSS directly; browsers block that, so the web build goes through the ROVEYA website.
function feedUrl(query: string) {
  if (Platform.OS === "web") return `${API}/api/v1/news?q=${encodeURIComponent(query)}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]) : "";
}

async function loadStories(query: string): Promise<Story[]> {
  const response = await fetch(feedUrl(query));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  if (!items.length && !xml.includes("<rss")) throw new Error("Feed unavailable");
  return items.slice(0, 30).map((block, index) => {
    const title = tag(block, "title");
    const source = tag(block, "source");
    const split = title.lastIndexOf(" - ");
    return {
      id: tag(block, "guid") || `${index}`,
      title: split > 0 ? title.slice(0, split) : title,
      source: source || (split > 0 ? title.slice(split + 3) : "Google News"),
      link: tag(block, "link"),
      publishedAt: Date.parse(tag(block, "pubDate")) || Date.now(),
      image: null,
    };
  });
}

function ago(at: number) {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

export function NewsScreen({ navigation }: NativeStackScreenProps<UserStack, "News">) {
  const [tab, setTab] = useState<Tab>("news");
  const [topic, setTopic] = useState(topics[0].key);
  const [stories, setStories] = useState<Story[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [post, setPost] = useState<BlogPost | null>(null);

  const fetchNews = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setState("loading");
    try {
      setStories(await loadStories(topics.find((item) => item.key === topic)!.query));
      setState("ready");
    } catch {
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, [topic]);

  useEffect(() => {
    if (tab === "news") void fetchNews();
  }, [tab, fetchNews]);

  return (
    <View style={styles.screen}>
      <PageTitle title="News & Blog" onBack={() => navigation.goBack()} />
      <View style={styles.tabs}>
        {(
          [
            ["news", "Travel news"],
            ["blog", "ROVEYA blog"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "news" ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics} style={{ flexGrow: 0, flexShrink: 0 }}>
            {topics.map((item) => (
              <Pressable key={item.key} onPress={() => setTopic(item.key)} style={[styles.topic, topic === item.key && styles.topicOn]}>
                <Text style={[styles.topicText, topic === item.key && { color: colors.night }]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {state === "loading" ? (
            <View style={{ padding: 16, paddingTop: 4, gap: 10 }}>
              {[0, 1, 2, 3, 4].map((index) => (
                <View key={index} style={styles.story}>
                  <Skeleton width={64} height={64} radius={12} />
                  <View style={{ flex: 1, gap: 7 }}>
                    <Skeleton height={12} />
                    <Skeleton width="75%" height={12} />
                    <Skeleton width="40%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          ) : state === "error" ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.faint} />
              <Text style={styles.centerTitle}>News could not load</Text>
              <Text style={styles.centerText}>Check your internet connection and try again. The ROVEYA blog works offline.</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Button label="Try again" onPress={() => void fetchNews()} style={{ flex: 1 }} />
                <Button label="Read the blog" tone="ghost" onPress={() => setTab("blog")} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <FlatList
              data={stories}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30, gap: 10 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchNews(true)} tintColor={colors.gold} colors={[colors.gold]} />}
              ListEmptyComponent={<Text style={styles.centerText}>No stories on this topic right now.</Text>}
              ListFooterComponent={<Text style={styles.credit}>Headlines from Google News. Tap a story to read it on the publisher's site.</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => void Linking.openURL(item.link)} style={({ pressed }) => [styles.story, pressed && { borderColor: colors.gold }]}>
                  {item.image ? <Image source={{ uri: item.image }} style={styles.storyImage} /> : (
                    <View style={[styles.storyImage, styles.storyIcon]}>
                      <Ionicons name="newspaper-outline" size={22} color={colors.gold} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storyTitle} numberOfLines={3}>{item.title}</Text>
                    <Text style={styles.storyMeta} numberOfLines={1}>{item.source} · {ago(item.publishedAt)}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={colors.faint} />
                </Pressable>
              )}
            />
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 14 }} showsVerticalScrollIndicator={false}>
          {blogPosts.map((item) => (
            <Pressable key={item.id} onPress={() => setPost(item)} style={({ pressed }) => [styles.post, pressed && { borderColor: colors.gold }]}>
              <Image source={item.image} style={styles.postImage} resizeMode="cover" />
              <View style={{ padding: 14 }}>
                <Text style={styles.postMeta}>{item.date} · {item.read}</Text>
                <Text style={styles.postTitle}>{item.title}</Text>
                <Text style={styles.postSummary}>{item.summary}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Sheet visible={Boolean(post)} onClose={() => setPost(null)} title={post?.title}>
        {post ? (
          <View style={{ gap: 12 }}>
            <Image source={post.image} style={styles.sheetImage} resizeMode="cover" />
            <Text style={styles.postMeta}>{post.date} · {post.read}</Text>
            {post.body.map((paragraph) => (
              <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  tabs: { flexDirection: "row", margin: 16, marginBottom: 6, padding: 4, borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 14 },
  tabOn: { backgroundColor: colors.gold },
  tabText: { color: colors.cream, fontFamily: type.medium, fontSize: 14 },
  tabTextOn: { color: colors.night, fontFamily: type.semibold },
  topics: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  topic: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkwell },
  topicOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  topicText: { color: colors.cream, fontFamily: type.medium, fontSize: 13 },
  center: { alignItems: "center", padding: 30, gap: 8 },
  centerTitle: { color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  centerText: { textAlign: "center", color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  story: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line },
  storyImage: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.mist },
  storyIcon: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  storyTitle: { color: colors.cream, fontFamily: type.medium, fontSize: 14, lineHeight: 19 },
  storyMeta: { marginTop: 6, color: colors.gold, fontFamily: type.regular, fontSize: 11.5 },
  credit: { marginTop: 8, textAlign: "center", color: colors.faint, fontFamily: type.regular, fontSize: 11.5 },
  post: { borderRadius: 18, backgroundColor: colors.inkwell, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  postImage: { width: "100%", height: 150 },
  postMeta: { color: colors.gold, fontFamily: type.medium, fontSize: 11.5 },
  postTitle: { marginTop: 6, color: colors.cream, fontFamily: type.semibold, fontSize: 16 },
  postSummary: { marginTop: 4, color: colors.muted, fontFamily: type.regular, fontSize: 13, lineHeight: 19 },
  sheetImage: { width: "100%", height: 160, borderRadius: 14 },
  paragraph: { color: colors.cream, fontFamily: type.regular, fontSize: 14.5, lineHeight: 22 },
});
