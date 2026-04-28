import { LinkPreset, type NavBarLink, type PresetNavBarLink } from "../type/config";
import { useTranslations } from "../i18n/translation";
import I18nKey from "../i18n/i18nKey";

export function getLinkPreset(locale: string, item: LinkPreset | PresetNavBarLink): NavBarLink {
  const t = useTranslations(locale);
  const preset = typeof item === 'number' ? item : item.preset;
  const link = {
    [LinkPreset.Home]: {
      name: t(I18nKey.home),
      url: "/",
    },
    [LinkPreset.Blog]: {
      name: t(I18nKey.blog), 
      url: "/blog/",
    },
    [LinkPreset.About]: {
      name: t(I18nKey.about),
      url: "/about/",
    },
    [LinkPreset.Demo]: {
      name: t(I18nKey.demo),
      url: "/demo/",
    },
    [LinkPreset.Tag]: {
      name: t(I18nKey.tags),
      url: "/tags/",
    },
  }[preset];

  return typeof item === 'number'
    ? link
    : {
        ...link,
        icon: item.icon,
      };
}
