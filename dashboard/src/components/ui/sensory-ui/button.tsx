"use client";

import * as React from "react";
import { useSensoryUI } from "@/components/ui/sensory-ui/config/provider";
import type { SoundRole } from "@/components/ui/sensory-ui/config/sound-roles";

const DEFAULT_BUTTON_SOUND = "interaction.tap" as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  sound?: SoundRole | false;
  volume?: number;
};

function Button({ sound, volume, onClick, ...props }: ButtonProps) {
  const { playSound } = useSensoryUI();

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (sound !== false) void playSound(sound ?? DEFAULT_BUTTON_SOUND, { volume });
      onClick?.(event);
    },
    [sound, volume, playSound, onClick]
  );

  return <button onClick={handleClick} {...props} />;
}

export { Button };
