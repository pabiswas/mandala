import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Svg, {
    Circle,
    Defs,
    G,
    Path,
    RadialGradient,
    Stop,
    Text as SvgText,
} from 'react-native-svg';

const MANDALA_LENGTH = 48;

const RINGS = [
    { name: "outer", count: 16, baseR: 118, height: 38, width: 30, offset: 0, dayStart: 33 },
    { name: "mid", count: 16, baseR: 78, height: 32, width: 22, offset: 11.25, dayStart: 17 },
    { name: "inner", count: 16, baseR: 44, height: 28, width: 14, offset: 0, dayStart: 1 },
] as const;

function petalPath(h: number, w: number): string {
    const hw = w / 2;
    return [
        'M 0 0',
        `Q ${-hw * 0.95} ${-h * 0.3} ${-hw * 0.65} ${-h * 0.82}`,
        `Q ${-hw * 0.18} ${-h * 1.02} 0 ${-h}`,
        `Q ${hw * 0.18} ${-h * 1.02} ${hw * 0.65} ${-h * 0.82}`,
        `Q ${hw * 0.95} ${-h * 0.3} 0 0`,
        'Z',
    ].join(" ");
}

const RING_PETALS = RINGS.map((ring) => {
    const step = 360 / ring.count;
    const d = petalPath(ring.height, ring.width);
    return {
        name: ring.name,
        petals: Array.from({ length: ring.count }, (_, i) => ({
            day: ring.dayStart + i,
            d,
            transform: `rotate(${i * step + ring.offset}) translate(0 ${-ring.baseR})`,
        })),
    };
});

const STAGGER_MS = 110;
const SETTLE_MS = 400;

interface MandalaBloomProps {
    /** Petals kept (days checked in), 0..48. */
    completedDays: number;
    /** Mandala length shown in the center count. The visual geometry is 48 petals. */
    durationDays: number;
    /** Highlight the most recently completed petal when it belongs to today. */
    isCompletedToday: boolean;
    /** Play the staggered unfurl on mount. */
    animate?: boolean;
    /** Show the "N / 48" count in the heart. */
    showCount?: boolean;
    /** Max render width in px (default 320, the legacy live size). */
    size?: number;
}

export function MandalaBloom({
    completedDays,
    durationDays,
    isCompletedToday,
    animate = false,
    showCount = false,
    size = 96,
}: MandalaBloomProps) {
    const displayDuration = Math.max(1, durationDays);
    const target = Math.max(0, Math.min(completedDays, MANDALA_LENGTH, displayDuration));
    const [lit, setLit] = useState(animate ? 0 : target);

    useEffect(() => {
        let isMounted = true;
        let timers: ReturnType<typeof setTimeout>[] = [];

        async function updateLitPetals() {
            const reduce = await AccessibilityInfo.isReduceMotionEnabled();
            
            if (!isMounted) {
                return;
            }

            if (!animate || reduce) {
                setLit(target);
                return;
            }
            
            setLit(0);
            for (let day = 1; day <= target; day+=1) {
                timers.push(setTimeout(() => setLit(day), SETTLE_MS + (day - 1) * STAGGER_MS));
            }
        }

        updateLitPetals();
       
        return () => {
            isMounted = false;
            timers.forEach((t) => clearTimeout(t));
        };
    }, [animate, target]);

    return (
        <View
            accessibilityLabel={`${target} of ${displayDuration} mandala petals bloomed`}
            accessibilityRole="image"
        >
        <Svg height={size} viewBox="-160 -160 320 320" width={size}>
            <Defs>
                <RadialGradient id="petal-grad-outer" cx="50%" cy="88%" r="115%">
                    <Stop offset="0%" stopColor="#F5C84F" />
                    <Stop offset="55%" stopColor="#E59A28" />
                    <Stop offset="100%" stopColor="#B8542D" />
                </RadialGradient>
                <RadialGradient id="petal-grad-mid" cx="50%" cy="85%" r="110%">
                    <Stop offset="0%" stopColor="#E89F2C" />
                    <Stop offset="55%" stopColor="#B8542D" />
                    <Stop offset="100%" stopColor="#7E3712" />
                </RadialGradient>
                <RadialGradient id="petal-grad-inner" cx="50%" cy="80%" r="110%">
                    <Stop offset="0%" stopColor="#C46A20" />
                    <Stop offset="55%" stopColor="#8A3D12" />
                    <Stop offset="100%" stopColor="#5C260A" />
                </RadialGradient>
                <RadialGradient id="heart-grad" cx="50%" cy="80%" r="110%">
                    <Stop offset="0%" stopColor="#8C6242" />
                    <Stop offset="55%" stopColor="#5A3A25" />
                    <Stop offset="100%" stopColor="#27140A" />
                </RadialGradient>
            </Defs>

            {RING_PETALS.map((ring) => (
                <G key={ring.name}>
                    {ring.petals.map((petal) => {
                        const isBloomed = petal.day <= lit;
                        const isToday = isCompletedToday && petal.day === target;
                    
                        return (
                            <Path
                                d={petal.d}
                                fill={isBloomed ? `url(#petal-grad-${ring.name})` : '#FFFFFF'}
                                key={petal.day}
                                opacity={isBloomed ? 1 : 0.5}
                                stroke={isToday ? '#1F6A6E' : isBloomed ? '#9C4F12' : '#D9CFB8'}
                                strokeWidth={isToday ? 2.6 : 1.2}
                                transform={petal.transform}
                        />
                        );
                    })}
                </G>
            ))}

            <Circle cx={0} cy={0} r={40} fill="url(#heart-grad)" />
            <SvgText
                fill="#F7F2E4"
                fontSize={showCount ? 26 : 38}
                fontWeight="700"
                textAnchor="middle"
                x={0}
                y={showCount ? 8: 13}
            >
                {showCount ? `${target} / ${displayDuration}` : '\u273B'}
            </SvgText>
        </Svg>
      </View>
    );
}