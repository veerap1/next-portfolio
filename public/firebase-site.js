import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js'
import { adminEmails, firebaseConfig } from '/firebase-config.js'

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
let currentUser = null

function escapeHtml(value) {
  const div = document.createElement('div')
  div.textContent = value ?? ''
  return div.innerHTML
}

function isAdmin(user) {
  return Boolean(user?.email) && adminEmails.includes(user.email)
}

function describeFirebaseError(error, fallback) {
  const code = error?.code || ''

  if (code === 'permission-denied') {
    return 'Permission denied. Publish the Firestore rules for your admin email.'
  }

  if (code === 'unauthenticated') {
    return 'Please sign in first.'
  }

  if (code === 'failed-precondition' || code === 'not-found') {
    return 'Create Cloud Firestore in Firebase before saving entries.'
  }

  return code ? `${fallback} (${code})` : fallback
}

function getEntriesCollection() {
  return collection(db, 'entries')
}

async function fetchEntries() {
  const entriesQuery = query(getEntriesCollection(), orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(entriesQuery)
  return snapshot.docs.map((entryDoc) => ({
    id: entryDoc.id,
    ...entryDoc.data()
  }))
}

async function createEntry(entry) {
  return addDoc(getEntriesCollection(), {
    ...entry,
    createdAt: serverTimestamp()
  })
}

async function removeEntry(id) {
  return deleteDoc(doc(db, 'entries', id))
}

async function removeAllEntries() {
  const entries = await fetchEntries()
  await Promise.all(entries.map((entry) => removeEntry(entry.id)))
}

function renderSavedEntries(entries, savedList, canDelete) {
  if (entries.length === 0) {
    savedList.innerHTML =
      '<p class="empty-state">No saved entries yet. Add your first post above.</p>'
    return
  }

  savedList.innerHTML = entries
    .map(
      (entry) => `
        <article class="saved-card">
          <div>
            <p class="saved-meta">${escapeHtml(entry.type)}${
              entry.tag ? ' / ' + escapeHtml(entry.tag) : ''
            }</p>
            <h3>${escapeHtml(entry.title)}</h3>
            <p>${escapeHtml(entry.description)}</p>
            ${
              entry.url
                ? `<a href="${escapeHtml(
                    entry.url
                  )}" target="_blank" rel="noreferrer">${escapeHtml(
                    entry.url
                  )}</a>`
                : ''
            }
          </div>
          ${
            canDelete
              ? `<button class="button secondary small-button" type="button" data-delete="${entry.id}">Delete</button>`
              : ''
          }
        </article>
      `
    )
    .join('')
}

async function main() {
  const form = document.getElementById('entry-form')
  const savedList = document.getElementById('saved-list')
  const status = document.getElementById('form-status')
  const authStatus = document.getElementById('auth-status')
  const clearButton = document.getElementById('clear-all')
  const signInButton = document.getElementById('sign-in')
  const signOutButton = document.getElementById('sign-out')

  const setEditorEnabled = (enabled) => {
    Array.from(form.elements).forEach((element) => {
      element.disabled = !enabled
    })
    clearButton.disabled = !enabled
  }

  const refreshSaved = async () => {
    try {
      const entries = await fetchEntries()
      renderSavedEntries(entries, savedList, isAdmin(currentUser))
    } catch (error) {
      savedList.innerHTML = `<p class="empty-state">${escapeHtml(
        describeFirebaseError(error, 'Could not load saved entries.')
      )}</p>`
    }
  }

  signInButton.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (error) {
      authStatus.textContent = describeFirebaseError(
        error,
        'Google sign-in failed.'
      )
    }
  })

  signOutButton.addEventListener('click', async () => {
    await signOut(auth)
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (!isAdmin(currentUser)) {
      status.textContent = 'Only the admin account can save content.'
      return
    }

    const formData = new FormData(form)
    const entry = {
      type: formData.get('type'),
      tag: String(formData.get('tag') || '').trim(),
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      url: String(formData.get('url') || '').trim(),
      authorEmail: currentUser.email
    }

    try {
      await createEntry(entry)
      form.reset()
      status.textContent = 'Entry saved.'
      await refreshSaved()
    } catch (error) {
      status.textContent = describeFirebaseError(error, 'Could not save entry.')
    }
  })

  savedList.addEventListener('click', async (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const deleteId = target.getAttribute('data-delete')
    if (!deleteId) return

    try {
      await removeEntry(deleteId)
      status.textContent = 'Entry deleted.'
      await refreshSaved()
    } catch (error) {
      status.textContent = describeFirebaseError(
        error,
        'Could not delete entry.'
      )
    }
  })

  clearButton.addEventListener('click', async () => {
    try {
      await removeAllEntries()
      status.textContent = 'All entries removed.'
      await refreshSaved()
    } catch (error) {
      status.textContent = describeFirebaseError(
        error,
        'Could not clear entries.'
      )
    }
  })

  onAuthStateChanged(auth, async (user) => {
    currentUser = user

    if (!user) {
      authStatus.textContent = 'Sign in with Google to manage content.'
      signInButton.hidden = false
      signOutButton.hidden = true
      setEditorEnabled(false)
      await refreshSaved()
      return
    }

    if (isAdmin(user)) {
      authStatus.textContent = `Signed in as ${user.email}.`
      setEditorEnabled(true)
    } else {
      authStatus.textContent = `Signed in as ${user.email}, but this account is read-only.`
      setEditorEnabled(false)
    }

    signInButton.hidden = true
    signOutButton.hidden = false
    await refreshSaved()
  })

  setEditorEnabled(false)
  await refreshSaved()
}

main()
