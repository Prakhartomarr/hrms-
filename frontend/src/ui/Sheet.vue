<script setup lang="ts">
/**
 * A bottom sheet on phones and a centred dialog on wider screens, built on <dialog>
 * (focus trap, Escape and the top layer come from the browser). Each sheet is its own
 * view for the one-primary-button rule.
 */
import { onMounted, provide, ref, watch } from "vue"
import Icon from "./Icon.vue"
import { PRIMARY_SCOPE } from "./keys"

const props = defineProps<{ open: boolean; title: string; description?: string }>()
const emit = defineEmits<{ (e: "update:open", value: boolean): void; (e: "close"): void }>()

let counter = 0
const id = `sheet-${Math.random().toString(36).slice(2, 8)}-${++counter}`
provide(PRIMARY_SCOPE, id)

const dialog = ref<HTMLDialogElement | null>(null)

function sync(open: boolean) {
	const el = dialog.value
	if (!el) return
	if (open && !el.open) el.showModal()
	if (!open && el.open) el.close()
}
watch(() => props.open, sync)
onMounted(() => sync(props.open))

function close() {
	emit("update:open", false)
	emit("close")
}
function onBackdrop(event: MouseEvent) {
	if (event.target === dialog.value) close()
}
</script>

<template>
	<dialog
		ref="dialog"
		class="ui-sheet"
		:aria-labelledby="`${id}-title`"
		@close="open && close()"
		@click="onBackdrop"
	>
		<div class="ui-sheet__panel">
			<header class="ui-sheet__header">
				<div>
					<h2 :id="`${id}-title`" class="ui-sheet__title">{{ title }}</h2>
					<p v-if="description" class="ui-sheet__description">{{ description }}</p>
				</div>
				<button type="button" class="ui-sheet__close" aria-label="Close" @click="close">
					<Icon name="x" />
				</button>
			</header>
			<div class="ui-sheet__body"><slot /></div>
			<footer v-if="$slots.footer" class="ui-sheet__footer"><slot name="footer" /></footer>
		</div>
	</dialog>
</template>

<style scoped>
.ui-sheet {
	padding: 0;
	border: none;
	background: transparent;
	color: var(--color-text);
	max-width: 100vw;
	max-height: 100dvh;
	width: 100%;
	margin: auto auto 0;
}
.ui-sheet::backdrop {
	background: var(--color-backdrop);
}
.ui-sheet__panel {
	background: var(--color-surface-raised);
	border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	box-shadow: var(--shadow-lg);
	max-height: 85dvh;
	display: flex;
	flex-direction: column;
	padding-bottom: env(safe-area-inset-bottom);
}
.ui-sheet__header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: var(--space-2);
	padding: var(--space-2) var(--space-2) var(--space-1) var(--space-3);
}
.ui-sheet__title {
	font-size: var(--text-xl);
	line-height: var(--text-xl-lh);
	font-weight: var(--weight-semibold);
	padding-top: var(--space-1);
}
.ui-sheet__description {
	color: var(--color-text-muted);
	margin-top: var(--space-half);
}
.ui-sheet__close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: var(--touch-min);
	height: var(--touch-min);
	border: none;
	border-radius: var(--radius-full);
	background: transparent;
	color: var(--color-text-muted);
	cursor: pointer;
}
.ui-sheet__close:hover {
	background: var(--color-surface-muted);
}
.ui-sheet__body {
	padding: var(--space-1) var(--space-3) var(--space-3);
	overflow-y: auto;
}
.ui-sheet__footer {
	padding: var(--space-2) var(--space-3);
	border-top: 1px solid var(--color-border);
}
@media (min-width: 600px) {
	.ui-sheet {
		width: min(560px, calc(100vw - var(--space-4)));
		margin: auto;
	}
	.ui-sheet__panel {
		border-radius: var(--radius-lg);
	}
}
</style>
