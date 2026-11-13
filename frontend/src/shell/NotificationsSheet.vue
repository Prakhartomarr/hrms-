<script setup lang="ts">
import { ref, watch } from "vue"
import { call } from "@/lib/api"
import { formatDate, formatTime } from "@/lib/format"
import { EmptyState, Sheet, Skeleton } from "@/ui"

type Notice = { name: string; subject: string; read: 0 | 1; creation: string; type: string }

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>()
const items = ref<Notice[] | null>(null)
const failed = ref(false)

watch(
	() => props.open,
	async (open) => {
		if (!open) return
		failed.value = false
		try {
			items.value = (await call("gamcs_hr.work_app.api.get_notifications", { limit: 7 })) as Notice[]
		} catch {
			failed.value = true
		}
	}
)

// Subjects are stored as HTML by Frappe; show them as plain text.
function plain(html: string): string {
	const el = document.createElement("div")
	el.innerHTML = html
	return el.textContent ?? ""
}
</script>

<template>
	<Sheet :open="open" title="Notifications" @update:open="emit('update:open', $event)">
		<EmptyState
			v-if="failed"
			icon="wifi-off"
			title="Couldn't load notifications"
			message="Check your connection and open this again."
		/>
		<Skeleton v-else-if="!items" :lines="4" label="Loading notifications" />
		<EmptyState
			v-else-if="!items.length"
			icon="bell"
			title="No notifications"
			message="Approvals, replies and reminders will show up here."
		/>
		<ul v-else class="notices" role="list">
			<li v-for="n in items" :key="n.name" class="notices__item">
				<span v-if="!n.read" class="notices__unread"><span class="visually-hidden">Unread: </span></span>
				<p class="notices__subject">{{ plain(n.subject) }}</p>
				<p class="notices__when num">{{ formatDate(n.creation) }}, {{ formatTime(n.creation) }}</p>
			</li>
		</ul>
	</Sheet>
</template>

<style scoped>
.notices {
	list-style: none;
	margin: 0;
	padding: 0;
}
.notices__item {
	position: relative;
	padding: var(--space-1) 0 var(--space-1) var(--space-3);
	border-bottom: var(--rule-width) solid var(--color-rule);
}
.notices__unread {
	position: absolute;
	left: var(--space-half);
	top: calc(var(--space-1) + 7px);
	width: 8px;
	height: 8px;
	border-radius: var(--radius-full);
	background: var(--color-primary);
}
.notices__when {
	color: var(--color-text-muted);
	font-size: var(--text-sm);
	line-height: var(--text-sm-lh);
}
</style>
