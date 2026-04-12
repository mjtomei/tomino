import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME_ID, THEMES, getTheme, type Theme } from "./themes.js";
import { DEFAULT_GENRE_ID, GENRES, getGenre, type Genre } from "./genres.js";

const THEME_STORAGE_KEY = "tetris.theme";
const GENRE_STORAGE_KEY = "tetris.genre";

export interface ThemeContextValue {
  themeId: string;
  genreId: string;
  theme: Theme;
  genre: Genre;
  setThemeId: (id: string) => void;
  setGenreId: (id: string) => void;
}

const defaultValue: ThemeContextValue = {
  themeId: DEFAULT_THEME_ID,
  genreId: DEFAULT_GENRE_ID,
  theme: getTheme(DEFAULT_THEME_ID),
  genre: getGenre(DEFAULT_GENRE_ID),
  setThemeId: () => {},
  setGenreId: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

function readStored(key: string, fallback: string, valid: Record<string, unknown>): string {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v && v in valid) return v;
  } catch {
    // ignore
  }
  return fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() =>
    readStored(THEME_STORAGE_KEY, DEFAULT_THEME_ID, THEMES),
  );
  const [genreId, setGenreIdState] = useState<string>(() =>
    readStored(GENRE_STORAGE_KEY, DEFAULT_GENRE_ID, GENRES),
  );

  const setThemeId = useCallback((id: string) => {
    if (!(id in THEMES)) return;
    setThemeIdState(id);
  }, []);

  const setGenreId = useCallback((id: string) => {
    if (!(id in GENRES)) return;
    setGenreIdState(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
    } catch {
      // ignore
    }
  }, [themeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(GENRE_STORAGE_KEY, genreId);
    } catch {
      // ignore
    }
  }, [genreId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      genreId,
      theme: getTheme(themeId),
      genre: getGenre(genreId),
      setThemeId,
      setGenreId,
    }),
    [themeId, genreId, setThemeId, setGenreId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export { THEME_STORAGE_KEY, GENRE_STORAGE_KEY };
