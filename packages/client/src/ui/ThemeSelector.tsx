import { THEMES } from "../atmosphere/themes.js";
import { GENRES } from "../atmosphere/genres.js";
import { useTheme } from "../atmosphere/theme-context.js";

export function ThemeSelector() {
  const { themeId, genreId, setThemeId, setGenreId } = useTheme();

  return (
    <div className="start-section" data-testid="theme-selector">
      <h2 className="start-section-title">Atmosphere</h2>
      <div className="theme-selector-row">
        <label>
          Theme
          <select
            data-testid="theme-select"
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
          >
            {Object.values(THEMES).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Genre
          <select
            data-testid="genre-select"
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
          >
            {Object.values(GENRES).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
