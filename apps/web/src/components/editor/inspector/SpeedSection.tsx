import React, { useState, useEffect, useMemo } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import type { Clip } from "@openreel/core";
import { getSpeedEngine } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { Input, Switch, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@openreel/ui";

interface SpeedSectionProps {
  clip?: Clip;
  clips?: Clip[];
}

const SPEED_PRESETS = [
  { label: "0.25×", value: 0.25 },
  { label: "0.5×", value: 0.5 },
  { label: "0.75×", value: 0.75 },
  { label: "1×", value: 1 },
  { label: "1.25×", value: 1.25 },
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
  { label: "5×", value: 5 },
];

export const SpeedSection: React.FC<SpeedSectionProps> = ({ clip, clips }) => {
  const speedEngine = getSpeedEngine();
  const { project } = useProjectStore();

  const targetClips = useMemo(() => {
    if (clips && clips.length > 0) return clips;
    if (clip) return [clip];
    return [];
  }, [clip, clips]);

  const primaryClip = targetClips[0];

  const [currentSpeed, setCurrentSpeed] = useState(() => {
    if (!primaryClip) return 1;
    return speedEngine.getClipSpeed(primaryClip.id) || 1;
  });

  const [isReversed, setIsReversed] = useState(() => {
    if (!primaryClip) return false;
    const speedData = speedEngine.getClipSpeedData(primaryClip.id);
    return speedData?.reverse || false;
  });

  const [customSpeed, setCustomSpeed] = useState<string>(
    currentSpeed.toString(),
  );
  const [affectAudio, setAffectAudio] = useState(true);

  useEffect(() => {
    if (primaryClip) {
      const speed = speedEngine.getClipSpeed(primaryClip.id) || 1;
      setCurrentSpeed(speed);
      setCustomSpeed(speed.toString());
      const speedData = speedEngine.getClipSpeedData(primaryClip.id);
      setIsReversed(speedData?.reverse || false);
    }
  }, [primaryClip]);

  useEffect(() => {
    setCustomSpeed(currentSpeed.toString());
  }, [currentSpeed]);

  const hasAudio = () => {
    return project.timeline.tracks.some((track) => {
      if (track.type !== "audio") return false;
      return track.clips.some((audioClip) =>
        targetClips.some((tc) => tc.mediaId === audioClip.mediaId)
      );
    });
  };

  const updateClipDuration = (speed: number) => {
    // 1. First, call speedEngine.setClipSpeed for each clip in targetClips
    targetClips.forEach((c) => {
      const origDur = c.outPoint - c.inPoint;
      speedEngine.setClipSpeed(c.id, speed, origDur);
    });

    // 2. Map the tracks to update clip durations in store
    const tracks = project.timeline.tracks.map((track) => {
      let trackChanged = false;
      const newClips = track.clips.map((c) => {
        // Is this clip in our targetClips?
        const isTarget = targetClips.some((tc) => tc.id === c.id);
        if (isTarget) {
          trackChanged = true;
          const origDur = c.outPoint - c.inPoint;
          return {
            ...c,
            duration: origDur / speed,
            speed,
          };
        }

        // If it's an audio track and affectAudio is true, check if it's linked to any targetClip
        if (affectAudio && track.type === "audio") {
          const linkedClip = targetClips.find((tc) => tc.mediaId === c.mediaId);
          if (linkedClip) {
            trackChanged = true;
            const origDur = c.outPoint - c.inPoint;
            speedEngine.setClipSpeed(c.id, speed, origDur);
            return {
              ...c,
              duration: origDur / speed,
              speed,
            };
          }
        }

        return c;
      });

      return trackChanged ? { ...track, clips: newClips } : track;
    });

    useProjectStore.setState({
      project: {
        ...project,
        timeline: { ...project.timeline, tracks },
        modifiedAt: Date.now(),
      },
    });
  };

  const updateClipReverse = (reversed: boolean) => {
    // 1. Call speedEngine.setReverse for each clip in targetClips
    targetClips.forEach((c) => {
      speedEngine.setReverse(c.id, reversed, c.duration);
    });

    // 2. Map the tracks to update reverse state in store
    const tracks = project.timeline.tracks.map((track) => {
      let trackChanged = false;
      const newClips = track.clips.map((c) => {
        const isTarget = targetClips.some((tc) => tc.id === c.id);
        if (isTarget) {
          trackChanged = true;
          return { ...c, reversed };
        }

        if (affectAudio && track.type === "audio") {
          const linkedClip = targetClips.find((tc) => tc.mediaId === c.mediaId);
          if (linkedClip) {
            trackChanged = true;
            speedEngine.setReverse(c.id, reversed, c.duration);
            return { ...c, reversed };
          }
        }

        return c;
      });

      return trackChanged ? { ...track, clips: newClips } : track;
    });

    useProjectStore.setState({
      project: {
        ...project,
        timeline: { ...project.timeline, tracks },
        modifiedAt: Date.now(),
      },
    });
  };

  const handleSpeedPreset = (speed: number) => {
    updateClipDuration(speed);
    setCurrentSpeed(speed);
  };

  const handleCustomSpeed = () => {
    const speed = parseFloat(customSpeed);
    if (!isNaN(speed) && speed >= 0.1 && speed <= 100) {
      updateClipDuration(speed);
      setCurrentSpeed(speed);
    }
  };

  const handleToggleReverse = () => {
    const newReversed = !isReversed;
    updateClipReverse(newReversed);
    setIsReversed(newReversed);
  };

  const smoothSlowMoChecked = primaryClip ? (primaryClip.smoothSlowMo ?? false) : false;
  const interpolationQualityValue = primaryClip ? (primaryClip.interpolationQuality ?? "medium") : "medium";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {SPEED_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => handleSpeedPreset(preset.value)}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
              currentSpeed === preset.value
                ? "bg-primary text-white shadow-lg shadow-primary/20"
                : "bg-background-tertiary hover:bg-background-elevated text-text-secondary hover:text-text-primary border border-border"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-text-tertiary">Custom Speed</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0.1}
            max={100}
            step={0.1}
            value={customSpeed}
            onChange={(e) => setCustomSpeed(e.target.value)}
            onBlur={handleCustomSpeed}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCustomSpeed();
              }
            }}
            className="flex-1 bg-background-tertiary border-border text-text-primary"
            placeholder="1.0"
          />
          <span className="flex items-center text-xs text-text-tertiary">
            ×
          </span>
        </div>
        <p className="text-xs text-text-tertiary">
          Range: 0.1× (slowest) to 100× (fastest)
        </p>
      </div>

      {hasAudio() && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary border border-border">
          <Label htmlFor="affect-audio" className="text-xs text-text-secondary">
            Apply speed to audio
          </Label>
          <Switch
            id="affect-audio"
            checked={affectAudio}
            onCheckedChange={setAffectAudio}
          />
        </div>
      )}

      <button
        onClick={handleToggleReverse}
        className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
          isReversed
            ? "bg-primary text-white shadow-lg shadow-primary/20"
            : "bg-background-tertiary hover:bg-background-elevated text-text-secondary hover:text-text-primary border border-border"
        }`}
      >
        <RotateCcw size={14} />
        {isReversed ? "Reversed" : "Reverse Clip"}
      </button>

      {currentSpeed < 1 && (
        <div className="space-y-2 p-3 rounded-lg bg-background-tertiary border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <Label htmlFor="smooth-slowmo" className="text-xs text-text-secondary">
                Smooth Slow Motion
              </Label>
            </div>
            <Switch
              id="smooth-slowmo"
              checked={smoothSlowMoChecked}
              onCheckedChange={(checked) => {
                const tracks = project.timeline.tracks.map((track) => {
                  let trackChanged = false;
                  const newClips = track.clips.map((c) => {
                    const isTarget = targetClips.some((tc) => tc.id === c.id);
                    if (isTarget) {
                      trackChanged = true;
                      return { ...c, smoothSlowMo: checked };
                    }
                    return c;
                  });
                  return trackChanged ? { ...track, clips: newClips } : track;
                });
                useProjectStore.setState({
                  project: {
                    ...project,
                    timeline: { ...project.timeline, tracks },
                    modifiedAt: Date.now(),
                  },
                });
              }}
            />
          </div>
          {smoothSlowMoChecked && (
            <div className="space-y-1">
              <Label className="text-xs text-text-tertiary">Quality</Label>
              <Select
                value={interpolationQualityValue}
                onValueChange={(value: "low" | "medium" | "high") => {
                  const tracks = project.timeline.tracks.map((track) => {
                    let trackChanged = false;
                    const newClips = track.clips.map((c) => {
                      const isTarget = targetClips.some((tc) => tc.id === c.id);
                      if (isTarget) {
                        trackChanged = true;
                        return { ...c, interpolationQuality: value };
                      }
                      return c;
                    });
                    return trackChanged ? { ...track, clips: newClips } : track;
                  });
                  useProjectStore.setState({
                    project: {
                      ...project,
                      timeline: { ...project.timeline, tracks },
                      modifiedAt: Date.now(),
                    },
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background-elevated border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (faster)</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High (slower)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-text-tertiary">
                Uses optical flow to generate smooth in-between frames
              </p>
            </div>
          )}
        </div>
      )}

      {(currentSpeed !== 1 || isReversed) && (
        <div className="p-3 rounded-lg bg-background-tertiary border border-border">
          <div className="text-xs text-text-tertiary mb-1">
            Current Settings
          </div>
          <div className="text-sm text-text-primary">
            Speed: {currentSpeed}× {isReversed && "• Reversed"}
            {primaryClip?.smoothSlowMo && " • Smooth"}
          </div>
        </div>
      )}
    </div>
  );
};
