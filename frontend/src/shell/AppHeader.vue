<script setup lang="ts">
import { computed, ref } from "vue"
import { session } from "@/data/session"
import { Icon } from "@/ui"
import BrandMark from "./BrandMark.vue"
import NotificationsSheet from "./NotificationsSheet.vue"
import SearchSheet from "./SearchSheet.vue"

const searchOpen = ref(false)
const notificationsOpen = ref(false)
const query = ref("")
const unread = computed(() => session.context?.unread_notifications ?? 0)
const initials = computed(() =>
	(session.context?.user.full_name ?? "")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("")
)

function openSearch() {
	searchOpen.value = true
}
</script>

<template>
	<header class="header">
		<RouterLink to="/" class="header__brand"><BrandMark compact /></RouterLink>

		<form class="header__search" role="search" @submit.prevent="openSearch">
			<label for="app-search" class="visually-hidden">Search</label>
			<Icon name="search" :size="18" class="header__search-icon" />
			<input
				id="app-search"
				v-model="query"
				type="search"
				placeholder="Search people, requests and policies"
				autocomplete="off"
			/>
		</form>

		<div class="header__actions">
			<button type="button" class="header__icon header__search-btn" aria-label="Search" @click="openSearch">
				<Icon name="search" />
			</button>
			<button
				type="button"
				class="header__icon"
				:aria-label="unread ? `Notifications, ${unread} unread` : 'Notifications'"
				@click="notificationsOpen = true"
			>
				<Icon name="bell" />
				<span v-if="unread" class="header__dot num" aria-hidden="true">{{ unread > 9 ? "9+" : unread }}</span>
			</button>
			<RouterLink to="/me" class="header__avatar" :aria-label="`Your profile, ${session.context?.user.full_name}`">
				<img v-if="session.context?.user.image" :src="session.context.user.image" alt="" />
				<span v-else aria-hidden="true">{{ initials }}</span>
			</RouterLink>
		</div>

		<SearchSheet v-model:open="searchOpen" :query="query" />
		<NotificationsSheet v-model:open="notificationsOpen" />
	</header>
</template>

<style scoped>
.header {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	gap: var(--space-2);
	height: var(--header-height);
	padding: 0 var(--space-1) 0 var(--space-2);
	background: var(--color-paper);
	border-bottom: var(--rule-width) solid var(--color-rule);
}
.header__brand {
	display: inline-flex;
	text-decoration: none;
}
.header__search {
	display: none;
	position: relative;
	flex: 1;
	max-width: 480px;
}
.header__search-icon {
	position: absolute;
	left: var(--space-1);
	top: 50%;
	transform: translateY(-50%);
	color: var(--color-text-subtle);
	pointer-events: none;
}
.header__search input {
	width: 100%;
	height: var(--control-height);
	padding: 0 var(--space-2) 0 var(--space-5);
	border: var(--rule-width) solid var(--color-border-strong);
	border-radius: var(--radius-sm);
	background: var(--color-surface);
	color: var(--color-text);
	font: inherit;
}
.header__search input::placeholder {
	color: var(--color-text-subtle);
}
.header__actions {
	display: flex;
	align-items: center;
	gap: var(--space-half);
	margin-left: auto;
}
.header__icon {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: var(--touch-min);
	height: var(--touch-min);
	border: none;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--color-text);
	cursor: pointer;
}
.header__icon:hover {
	background: var(--color-surface-muted);
}
.header__dot {
	position: absolute;
	top: 6px;
	right: 4px;
	min-width: 18px;
	height: 18px;
	padding: 0 4px;
	border-radius: var(--radius-full);
	background: var(--color-primary);
	color: var(--color-on-primary);
	font-size: 11px;
	line-height: 18px;
	text-align: center;
}
.header__avatar {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: var(--touch-min);
	height: var(--touch-min);
	color: var(--color-text);
	text-decoration: none;
	font-size: var(--text-sm);
	font-weight: var(--weight-semibold);
}
.header__avatar > * {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border: var(--rule-width) solid var(--color-rule-strong);
	border-radius: var(--radius-sm);
	object-fit: cover;
}
@media (min-width: 900px) {
	.header {
		padding: 0 var(--space-3) 0 var(--space-4);
	}
	.header__brand,
	.header__search-btn {
		display: none;
	}
	.header__search {
		display: block;
	}
}
</style>
