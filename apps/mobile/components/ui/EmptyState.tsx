import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  const { colors } = useColorScheme();

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={{
        width: "100%",
        paddingHorizontal: 20,
        paddingVertical: 52,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          shadowColor: "#6b5a46",
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 4,
        }}
        className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-primary/10"
      >
        <Icon size={38} color={colors.primary} />
      </View>
      <Text className="mb-1 text-xs font-semibold uppercase tracking-[3px] text-muted-foreground">
        Your Library
      </Text>
      <Text variant="title3" style={{ textAlign: "center", width: "100%" }}>
        {title}
      </Text>
      <Text
        style={{ textAlign: "center", width: "100%", marginTop: 6 }}
        className="text-muted-foreground"
      >
        {subtitle}
      </Text>
    </Animated.View>
  );
}
