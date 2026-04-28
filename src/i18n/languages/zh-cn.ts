import I18nKey from "../i18nKey";
import type { Translation } from "../translation";

export const zh_cn: Translation = {
  [I18nKey.home]: "首页",
  [I18nKey.blog]: "博客",
  [I18nKey.graph]: "关系图谱",
  [I18nKey.about]: "关于",
  [I18nKey.archive]: "归档",
  [I18nKey.search]: "搜索",
  [I18nKey.links]: "链接",
  [I18nKey.feed]: "推送",
  [I18nKey.demo]: "演示",
  [I18nKey.tags]: "标签",
  [I18nKey.lang]: "简体中文",
  [I18nKey.note]: "附注",
  [I18nKey.tip]: "提示",
  [I18nKey.previous]: "上一篇",
  [I18nKey.next]: "下一篇",
  [I18nKey.important]: "重要",
  [I18nKey.warning]: "警告",
  [I18nKey.caution]: "注意",
  [I18nKey.tags_colon]: "标签：",
  [I18nKey.skip_to_content]: "跳到主内容",
  [I18nKey.go_to_top]: "返回顶部",
  [I18nKey.go_home]: "返回主页",
  [I18nKey.created]: "创建时间：",
  [I18nKey.updated]: "更新于：",
  [I18nKey.theme]: "主题",
  [I18nKey.theme_color]: "主题颜色",
  [I18nKey.theme_dark]: "切换到深色主题",
  [I18nKey.theme_light]: "切换到浅色主题",
  [I18nKey.theme_system]: "使用系统主题",
  [I18nKey.table_of_contents]: "目录",
  [I18nKey.powered_by]: "由 {Astro} 和 {Goosequill} 提供支持",
  [I18nKey.filter_by_tags]: "按标签筛选",
  [I18nKey.posts_with_tag]: "带有标签的文章：",
  [I18nKey.expand_graph]: "展开关系图谱",
  
  [I18nKey.n_tags]: {
    zero: "暂无标签",
    one: "共 {count} 个标签",
    other: "共 {count} 个标签",
  },
  [I18nKey.n_posts]: {
    zero: "暂无文章",
    one: "共 {count} 篇文章",
    other: "共 {count} 篇文章",
  },
  
  [I18nKey.minutes_read]: {
    one: "1 分钟阅读",
    other: "{count} 分钟阅读",
  },
  
  [I18nKey.word_count]: {
    one: "{count} 字",
    other: "{count} 字",
  },
  
  [I18nKey.by_author]: ["作者：", "，", " 和 "],
  
  [I18nKey.not_found]: "页面未找到",
  [I18nKey.not_found_text]: "请求的页面无法找到。",
};
