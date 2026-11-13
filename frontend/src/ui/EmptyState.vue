<script setup lang="ts">
// Nothing to show yet: say why, and offer at most one way forward (a secondary button,
// so it never competes with the page's primary action).
import type { Action } from "./PageActions.vue"
import Icon from "./Icon.vue"
import UiButton from "./UiButton.vue"

withDefaults(defineProps<{ title: string; message?: string; icon?: string; action?: Action }>(), {
	icon: "inbox",
})
</script>

<template>
	<div class="ui-empty">
		<span class="ui-empty__icon"><Icon :name="icon" :size="24" /></span>
		<h2 class="ui-empty__title">{{ title }}</h2>
		<p v-if="message" class="ui-empty__message">{{ message }}</p>
		<slot />
		<UiButton
			v-if="action"
			class="ui-empty__action"
			variant="secondary"
			:to="action.to"
			:icon="action.icon"
			@click="action.onClick?.()"
		>
			{{ action.label }}
		</UiButton>
	</div>
</template>

<style scoped>
.ui-empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--space-1);
	padding: var(--space-3) 0;
}
.ui-empty__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: var(--space-6);
	height: var(--space-6);
	border: var(--rule-width) solid var(--color-rule);
	border-radius: var(--radius-sm);
	color: var(--color-primary);
	margin-bottom: var(--space-1);
}
.ui-empty__title {
	font-size: var(--text-lg);
	line-height: var(--text-lg-lh);
	font-weight: var(--weight-semibold);
}
.ui-empty__message {
	color: var(--color-text-muted);
	max-width: 48ch;
}
.ui-empty__action {
	margin-top: var(--space-2);
}
</style>
