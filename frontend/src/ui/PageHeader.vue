<script setup lang="ts">
// No eyebrow/kicker labels (direction contract). The page title (one h1 per page), an optional line under it, and a slot for a
// back link or small secondary actions on the right. Primary actions go in PageActions.
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
	<header class="page-header">
		<div class="page-header__text">
			<h1 class="page-header__title">{{ title }}</h1>
			<p v-if="subtitle || $slots.subtitle" class="page-header__subtitle">
				<slot name="subtitle">{{ subtitle }}</slot>
			</p>
		</div>
		<div v-if="$slots.default" class="page-header__aside"><slot /></div>
	</header>
</template>

<style scoped>
.page-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-2);
	margin-bottom: var(--space-3);
}
.page-header__title {
	font-size: var(--text-2xl);
	line-height: var(--text-2xl-lh);
	font-weight: var(--weight-bold);
	letter-spacing: -0.01em;
}
.page-header__subtitle {
	margin-top: var(--space-half);
	color: var(--color-text-muted);
}
.page-header__aside {
	display: flex;
	gap: var(--space-1);
	flex: none;
}
@media (min-width: 900px) {
	.page-header__title {
		font-size: var(--text-3xl);
		line-height: var(--text-3xl-lh);
	}
}
</style>
