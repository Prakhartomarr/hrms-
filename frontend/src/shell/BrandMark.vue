<script setup lang="ts">
// Placeholder mark until the GA logo file is added (brand deck). Square, ink on paper.
defineProps<{ compact?: boolean }>()
</script>

<template>
	<span class="brand">
		<svg class="brand__mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
			<rect x="0.5" y="0.5" width="27" height="27" rx="2" class="brand__box" />
			<text x="14" y="18.5" text-anchor="middle" class="brand__ga">GA</text>
		</svg>
		<span v-if="!compact" class="brand__name">GAMCS HR</span>
		<span v-else class="visually-hidden">GAMCS HR</span>
	</span>
</template>

<style scoped>
.brand {
	display: inline-flex;
	align-items: center;
	gap: var(--space-1);
	color: var(--color-text);
	text-decoration: none;
}
.brand__box {
	fill: var(--color-primary);
}
.brand__ga {
	fill: var(--color-on-primary);
	font-family: var(--font-heading);
	font-weight: 800;
	font-size: 12px;
}
.brand__name {
	font-family: var(--font-heading);
	font-weight: var(--weight-bold);
	font-size: var(--text-lg);
	letter-spacing: -0.01em;
}
</style>
