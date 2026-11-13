<script setup lang="ts">
/**
 * The audit tick. `done` draws a hand-made tick in (stroke-dashoffset, 240ms ease-out);
 * not done shows an empty hairline box, so a pending line still reads as a checklist
 * entry. Under prefers-reduced-motion the tick appears without drawing.
 */
withDefaults(defineProps<{ done?: boolean; size?: number; label?: string }>(), { size: 24 })
</script>

<template>
	<svg
		class="ui-tick"
		:class="{ 'ui-tick--done': done }"
		:width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="none"
		:role="label ? 'img' : undefined"
		:aria-label="label"
		:aria-hidden="label ? undefined : 'true'"
	>
		<path
			v-if="done"
			class="ui-tick__stroke"
			pathLength="1"
			d="M3.5 13.2c1.6.6 3.4 2.1 5.4 5.3C11.6 12 15.4 7.1 20.8 3.6"
		/>
		<rect v-else class="ui-tick__box" x="4.5" y="4.5" width="15" height="15" rx="1" />
	</svg>
</template>

<style scoped>
.ui-tick {
	flex: none;
	display: block;
}
.ui-tick__stroke {
	stroke: var(--color-tick);
	stroke-width: 2.25;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-dasharray: 1;
	stroke-dashoffset: 0;
	animation: ui-tick-draw var(--duration-tick) var(--ease-out) both;
}
.ui-tick__box {
	stroke: var(--color-border-strong);
	stroke-width: 1;
}
@keyframes ui-tick-draw {
	from {
		stroke-dashoffset: 1;
	}
	to {
		stroke-dashoffset: 0;
	}
}
@media (prefers-reduced-motion: reduce) {
	.ui-tick__stroke {
		animation: none;
	}
}
</style>
