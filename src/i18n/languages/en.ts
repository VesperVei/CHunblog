import I18nKey from "../i18nKey";
import type { Translation } from "../translation";

export const en: Translation = {
  [I18nKey.home]: "Home",
  [I18nKey.blog]: "Blog",
  [I18nKey.graph]: "Relationship Graph",
  [I18nKey.about]: "About",
  [I18nKey.archive]: "Archive",
  [I18nKey.search]: "Search",
  [I18nKey.links]: "Links",
  [I18nKey.feed]: "Feed",
  [I18nKey.demo]: "Demo",
  [I18nKey.tags]: "Tags",
  [I18nKey.lang]: "English",
  [I18nKey.note]: "Note",
  [I18nKey.tip]: "Tip",
  [I18nKey.previous]: "Previous",
  [I18nKey.next]: "Next",
  [I18nKey.important]: "Important",
  [I18nKey.warning]: "Warning",
  [I18nKey.caution]: "Caution",
  [I18nKey.tags_colon]: "Tags:",
  [I18nKey.skip_to_content]: "Skip to Main Content",
  [I18nKey.go_to_top]: "Go to Top",
  [I18nKey.go_home]: "Go home",
  [I18nKey.created]: "Created on",
  [I18nKey.updated]: "Updated on",
  [I18nKey.theme]: "Theme",
  [I18nKey.theme_color]: "Theme Color",
  [I18nKey.theme_dark]: "Switch to Dark Theme",
  [I18nKey.theme_light]: "Switch to Light Theme",
  [I18nKey.theme_system]: "Use System Theme",
  [I18nKey.table_of_contents]: "Table of Contents",
  [I18nKey.powered_by]: "Powered by {Astro} and {Goosequill}",
  [I18nKey.filter_by_tags]: "Filter by tags",
  [I18nKey.posts_with_tag]: "Posts with tag:",
  [I18nKey.expand_graph]: "Open full graph",
  
  [I18nKey.n_tags]: {
    zero: "No tags yet",
    one: "{count} tag in total",
    other: "{count} tags in total",
  },
  [I18nKey.n_posts]: {
    zero: "No posts yet",
    one: "{count} post in total",
    other: "{count} posts in total",
  },
  
  [I18nKey.minutes_read]: {
    one: "1 minute read",
    other: "{count} minutes read",
  },
  
  [I18nKey.word_count]: {
    one: "{count} word",
    other: "{count} words",
  },
  
  [I18nKey.by_author]: ["By ", ", ", " and "],
  
  [I18nKey.not_found]: "Page Not Found",
  [I18nKey.not_found_text]: "The requested page could not be found.",
};
