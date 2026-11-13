<script setup lang="ts">
// Placeholder while data loads. `lines` draws text rows; `height` draws one block.
withDefaults(
	defineProps<{ lines?: number; height?: string; width?: string; circle?: boolean; label?: string }>(),
	{ lines: 0, label: "Loading" }
)
</script>

<template>
	<div class="ui-skeleton" role="status" :aria-label="label">
		<template v-if="lines">
			<span
				v-for="i in lines"
				:key="i"
				class="ui-skeleton__bar"
				:style="{ width: i === lines && lines > 1 ? '60%' : width ?? '100%' }"
			/>
		</template>
		<span
			v-else
			class="ui-skeleton__bar"
			:class="{ 'ui-skeleton__bar--circle': circle }"
			:style="{ height: height ?? '1rem', width: width ?? (circle ? height ?? '1rem' : '100%') }"
		/>
	</div>
</template>

<style scoped>
.ui-skeleton {
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
}
.ui-skeleton__bar {
	display: block;
	height: var(--text-md);
	border-radius: var(--radius-sm);
	background: linear-gradient(
		90deg,
		var(--color-skeleton) 0%,
		var(--color-skeleton-shine) 50%,
		var(--color-skeleton) 100%
	);
	background-size: 200% 100%;
	animation: ui-shimmer 1.4s ease-in-out infinite;
}
.ui-skeleton__bar--circle {
	border-radius: var(--radius-full);
}
@keyframes ui-shimmer {
	from {
		background-position: 100% 0;
	}
	to {
		background-position: -100% 0;
	}
}
</style>
