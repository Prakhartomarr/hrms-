<script setup lang="ts">
// The stamp a punch leaves on the sheet: what, when (mono) and where.
defineProps<{ label: string; time: string; place?: string }>()
</script>

<template>
	<div class="ui-stamp" role="status">
		<span class="ui-stamp__label">{{ label }}</span>
		<span class="ui-stamp__time num">{{ time }}</span>
		<span v-if="place" class="ui-stamp__place">{{ place }}</span>
	</div>
</template>

<style scoped>
.ui-stamp {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: baseline;
	column-gap: var(--space-1);
	padding: var(--space-1) var(--space-2);
	border: 2px solid var(--color-stamp);
	outline: var(--rule-width) solid var(--color-stamp);
	outline-offset: 2px;
	border-radius: var(--radius-sm);
	color: var(--color-stamp);
	transform: rotate(-1deg);
}
.ui-stamp__label {
	font-family: var(--font-heading);
	font-weight: var(--weight-bold);
}
.ui-stamp__time {
	font-size: var(--text-lg);
	font-weight: var(--weight-semibold);
}
.ui-stamp__place {
	font-size: var(--text-sm);
}
</style>
