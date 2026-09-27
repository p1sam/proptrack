"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Searchable IANA timezone picker. `zones` comes from the server (Intl.supportedValuesOf). */
export function TimezoneSelect({ id, value, onChange, zones, invalid }: { id: string; value: string; onChange: (tz: string) => void; zones: string[]; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid || undefined} className="w-full justify-between font-normal">
          <span className="truncate">{value || "Choose a timezone"}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezones…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((z) => (
                <CommandItem
                  key={z}
                  value={z}
                  data-checked={z === value}
                  keywords={[z.replace(/_/g, " ")]}
                  onSelect={() => {
                    onChange(z);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{z.replace(/_/g, " ")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
