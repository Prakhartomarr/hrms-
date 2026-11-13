<script setup lang="ts">
// A ruled section of the working paper: a heading on a strong rule, then RuledLines.
defineProps<{ title: string; note?: string }>()
</script>

<template>
	<section class="ui-ruled">
		<header class="ui-ruled__header">
			<h2 class="ui-ruled__title">{{ title }}</h2>
			<p v-if="note" class="ui-ruled__note">{{ note }}</p>
		</header>
		<ul class="ui-ruled__list" role="list"><slot /></ul>
	</section>
</template>

<style scoped>
.ui-ruled {
	margin-top: var(--space-4);
}
.ui-ruled__header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--space-2);
	padding-bottom: var(--space-1);
	border-bottom: var(--rule-width) solid var(--color-rule-strong);
}
.ui-ruled__title {
	font-size: var(--text-lg);
	line-height: var(--text-lg-lh);
	font-weight: var(--weight-semibold);
}
.ui-ruled__note {
	color: var(--color-text-subtle);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
}
.ui-ruled__list {
	list-style: none;
	margin: 0;
	padding: 0;
}
</style>
