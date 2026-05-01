import friendsGraphData from "../../../data/friends-graph.json";
import friendsGraphUrl from "../../../data/friends-graph.json?url";

export { friendsGraphUrl };

export function getFriendsGraphCount() {
  return friendsGraphData.nodes.filter((node) => node.type === "friend").length;
}

export function getFriendsGraphAnchorIds(locale: string) {
  return friendsGraphData.nodes
    .map((node) => node.urls?.[locale as "en" | "zh-cn"] ?? node.urls?.en)
    .filter((url): url is string => typeof url === "string" && url.includes("#"))
    .map((url) => url.slice(url.indexOf("#") + 1));
}

export function getFriendsGraphCopy(locale: string) {
  return locale === "zh-cn"
    ? "这里的朋友关系单独维护：共享标签会自然聚在一起，少量重要关系则直接落在边上。"
    : "This friend graph is maintained separately: shared tags gather people into small constellations, while important ties live directly on the edges.";
}

export const friendsGraphVisibleSettingsGroups = ["appearance", "forces", "layout"];
