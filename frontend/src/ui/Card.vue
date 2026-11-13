<script setup lang="ts">
withDefaults(
	defineProps<{ title?: string; as?: string; padding?: "none" | "md" | "lg" }>(),
	{ as: "section", padding: "md" }
)
</script>

<template>
	<component :is="as" class="ui-card" :class="`ui-card--pad-${padding}`">
		<header v-if="title || $slots.header" class="ui-card__header">
			<slot name="header">
				<h2 class="ui-card__title">{{ title }}</h2>
			</slot>
		</header>
		<slot />
	</component>
</template>

<style scoped>
.ui-card {
	background: var(--color-paper);
	border: var(--rule-width) solid var(--color-rule);
	border-radius: var(--radius-sm);
}
.ui-card--pad-md {
	padding: var(--space-2);
}
.ui-card--pad-lg {
	padding: var(--space-3);
}
.ui-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--space-1);
	margin-bottom: var(--space-2);
}
.ui-card__title {
	font-size: var(--text-lg);
	line-height: var(--text-lg-lh);
	font-weight: var(--weight-semibold);
}
@media (min-width: 900px) {
	.ui-card--pad-md {
		padding: var(--space-3);
	}
}
</style>
