'use client';

import { useState, useMemo } from 'react';

// ============================================================================
// MultiDateCalendar — Click-to-toggle multi-select calendar component.
// ============================================================================

interface MultiDateCalendarProps {
  selectedDates: string[]; // ISO date strings: 'YYYY-MM-DD'
  onChange: (dates: string[]) => void;
  accentColor?: 'indigo' | 'emerald' | 'amber' | 'primary';
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ACCENT_CLASSES: Record<string, { selected: string; hover: string; chip: string }> = {
  indigo: {
    selected: 'bg-primary text-white shadow-md shadow-primary/30',
    hover: 'hover:bg-primary/10 hover:text-primary',
    chip: 'bg-primary/10 text-primary border-primary/30',
  },
  emerald: {
    selected: 'bg-success text-white shadow-md shadow-success/30',
    hover: 'hover:bg-success-muted hover:text-success',
    chip: 'bg-success-muted text-success border-success/30',
  },
  amber: {
    selected: 'bg-warning text-white shadow-md shadow-warning/30',
    hover: 'hover:bg-warning-muted hover:text-warning',
    chip: 'bg-warning-muted text-warning border-warning/30',
  },
  primary: {
    selected: 'bg-primary text-white shadow-md shadow-primary/30',
    hover: 'hover:bg-primary/10 hover:text-primary',
    chip: 'bg-primary/10 text-primary border-primary/30',
  },
};

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatChipDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${dayNames[d.getDay()]} ${d.getDate()}`;
}

export default function MultiDateCalendar({
  selectedDates,
  onChange,
  accentColor = 'primary',
}: MultiDateCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const accent = ACCENT_CLASSES[accentColor] || ACCENT_CLASSES.primary;
  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);

  // Build the grid for the current month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);

    // Monday = 0, Sunday = 6 (ISO week)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { day: number; iso: string; inMonth: boolean }[] = [];

    // Leading blanks
    for (let i = 0; i < startDow; i++) {
      days.push({ day: 0, iso: '', inMonth: false });
    }

    // Month days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ day: d, iso: toISO(viewYear, viewMonth, d), inMonth: true });
    }

    return days;
  }, [viewYear, viewMonth]);

  function toggleDate(iso: string) {
    if (selectedSet.has(iso)) {
      onChange(selectedDates.filter((d) => d !== iso));
    } else {
      onChange([...selectedDates, iso].sort());
    }
  }

  function removeDate(iso: string) {
    onChange(selectedDates.filter((d) => d !== iso));
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors text-muted hover:text-foreground"
        >
          ◀
        </button>
        <h3 className="text-sm font-semibold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors text-muted hover:text-foreground"
        >
          ▶
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-xs font-medium text-muted py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((cell, i) => {
          if (!cell.inMonth) {
            return <div key={`blank-${i}`} className="w-full aspect-square" />;
          }

          const isSelected = selectedSet.has(cell.iso);
          const isToday = cell.iso === todayISO;

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => toggleDate(cell.iso)}
              className={`
                w-full aspect-square rounded-lg text-sm font-medium
                flex items-center justify-center transition-all duration-150
                ${isSelected
                  ? accent.selected
                  : `text-foreground ${accent.hover}`
                }
                ${isToday && !isSelected ? 'ring-1 ring-primary/50' : ''}
              `}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Selected count */}
      <div className="text-xs text-muted text-center pt-1">
        {selectedDates.length === 0
          ? 'Click dates to select them'
          : `✅ ${selectedDates.length} date${selectedDates.length > 1 ? 's' : ''} selected`}
      </div>

      {/* Date chips */}
      {selectedDates.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selectedDates.map((iso) => (
            <span
              key={iso}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border ${accent.chip}`}
            >
              {formatChipDate(iso)}
              <button
                type="button"
                onClick={() => removeDate(iso)}
                className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
