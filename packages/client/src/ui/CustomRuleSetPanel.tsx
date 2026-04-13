import type { RuleSet } from "@tomino/shared";

export interface CustomRuleSetPanelProps {
  ruleSet: RuleSet;
  onChange: (updated: RuleSet) => void;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="custom-field">
      <span className="custom-field-label">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        placeholder={!Number.isFinite(value) ? "Inf" : undefined}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || v === "Inf") {
            onChange(Infinity);
          } else {
            onChange(Number(v));
          }
        }}
        className="custom-field-input"
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="custom-field">
      <span className="custom-field-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="custom-field-input"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="custom-field custom-field-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="custom-field-label">{label}</span>
    </label>
  );
}

export function CustomRuleSetPanel({ ruleSet, onChange }: CustomRuleSetPanelProps) {
  const update = (overrides: Partial<RuleSet>) => onChange({ ...ruleSet, ...overrides });

  return (
    <div className="custom-panel" data-testid="custom-panel">
      <h3 className="custom-panel-title">Custom Rules</h3>
      <div className="custom-panel-grid">
        <SelectField
          label="Rotation"
          value={ruleSet.rotationSystem}
          options={[
            { value: "srs", label: "SRS (Modern)" },
            { value: "nrs", label: "NRS (Classic)" },
          ]}
          onChange={(v) => update({ rotationSystem: v })}
        />
        <SelectField
          label="Randomizer"
          value={ruleSet.randomizer}
          options={[
            { value: "7bag", label: "7-Bag" },
            { value: "pure-random", label: "Pure Random" },
          ]}
          onChange={(v) => update({ randomizer: v })}
        />
        <SelectField
          label="Scoring"
          value={ruleSet.scoringSystem}
          options={[
            { value: "guideline", label: "Guideline" },
            { value: "nes", label: "NES" },
          ]}
          onChange={(v) => update({ scoringSystem: v })}
        />
        <SelectField
          label="Gravity"
          value={ruleSet.gravityCurve}
          options={[
            { value: "guideline", label: "Guideline" },
            { value: "nes", label: "NES" },
          ]}
          onChange={(v) => update({ gravityCurve: v })}
        />
        <NumberField label="Lock Delay (ms)" value={ruleSet.lockDelay} onChange={(v) => update({ lockDelay: v })} min={0} step={50} />
        <NumberField label="Lock Resets" value={ruleSet.lockResets} onChange={(v) => update({ lockResets: v })} min={0} />
        <NumberField label="DAS (ms)" value={ruleSet.das} onChange={(v) => update({ das: v })} min={0} step={10} />
        <NumberField label="ARR (ms)" value={ruleSet.arr} onChange={(v) => update({ arr: v })} min={0} step={5} />
        <NumberField label="SDF" value={ruleSet.sdf} onChange={(v) => update({ sdf: v })} min={1} />
        <NumberField label="Preview Count" value={ruleSet.previewCount} onChange={(v) => update({ previewCount: v })} min={0} max={6} />
        <CheckField label="Hold Enabled" checked={ruleSet.holdEnabled} onChange={(v) => update({ holdEnabled: v })} />
        <CheckField label="Hard Drop" checked={ruleSet.hardDropEnabled} onChange={(v) => update({ hardDropEnabled: v })} />
        <CheckField label="Ghost Piece" checked={ruleSet.ghostEnabled} onChange={(v) => update({ ghostEnabled: v })} />
      </div>
    </div>
  );
}
