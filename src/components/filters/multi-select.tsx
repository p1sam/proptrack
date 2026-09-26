"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

export function MultiSelect({ label, options, value, onChange, searchable = true }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; searchable?: boolean }) {
  const selected = new Set(value);
  const summary = value.length === 0 ? label : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? label : `${label} · ${value.length}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("max-w-48 gap-1", value.length && "border-primary/50 bg-primary/10")}>
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          {searchable && options.length > 6 && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    const next = new Set(selected);
                    if (next.has(o.value)) next.delete(o.value);
                    else next.add(o.value);
                    onChange([...next]);
                  }}
                >
                  <span className={cn("flex size-4 items-center justify-center rounded-sm border", selected.has(o.value) && "border-primary bg-primary text-primary-foreground")}>
                    {selected.has(o.value) && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {value.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
