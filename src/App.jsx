import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const USER_STORAGE_KEY = 'asanmaeng_user_v1'

// 👇 운영자 로그인 정보
const ADMIN_NICKNAME = '게장'
const ADMIN_PASSWORD = '1103'

const categories = [
  '공지사항',
  '문파컨텐츠',
  '공략 및 꿀팁',
  '파티 모집',
  '거래게시판',
  '자유게시판',
  '문의사항',
]

// 홈 화면에 보이는 순서 ('최신글'은 전체 게시판의 최신글 모음)
const HOME_ORDER = [
  '공지사항',
  '최신글',
  '자유게시판',
  '파티 모집',
  '거래게시판',
  '문파컨텐츠',
  '공략 및 꿀팁',
  '문의사항',
]

// 홈 화면에서 게시판별로 보여줄 최신글 개수
const HOME_POSTS_PER_BOARD = 5

// 홈 화면 '최신글' 박스에 보여줄 개수
const HOME_LATEST_COUNT = 6

const initialPosts = [
  {
    game: '공지사항',
    title: '아산맹 문파 커뮤니티에 오신 것을 환영합니다!',
    content: '문파 공지사항과 컨텐츠, 공략 및 꿀팁, 파티 모집을 자유롭게 이용해 주세요.',
    author: '게장',
    likes: 15,
    views: 500,
    type: '공지사항',
  },
]

function loadSavedUser() {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (err) {
    console.error('저장된 회원 정보 불러오기 실패:', err)
  }
  return null
}

// 이미지 파일을 용량 줄여서 Base64로 변환하는 도우미
function compressImage(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 대문 사진용: 이미지를 줄여서 파일(Blob)로 변환
function compressImageToBlob(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          blob => (blob ? resolve(blob) : reject(new Error('이미지 변환 실패'))),
          'image/jpeg',
          0.85
        )
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 작성시간 표시 도우미
function formatDateTime(value, full = false) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''

  const pad = n => String(n).padStart(2, '0')
  const yyyy = d.getFullYear()
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const min = pad(d.getMinutes())

  if (full) return `${yyyy}-${mm}-${dd} ${hh}:${min}`

  // 목록에서는 오늘 작성한 글은 시간만, 이전 글은 날짜만 표시
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  return isToday ? `${hh}:${min}` : `${yyyy}-${mm}-${dd}`
}

function App() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(loadSavedUser)
  const [likedPostIds, setLikedPostIds] = useState([])
  const [myPostIds, setMyPostIds] = useState([])
  const [myCommentIds, setMyCommentIds] = useState([])

  const [authModal, setAuthModal] = useState(null)
  const [nicknameInput, setNicknameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')

  // 처음 들어오면 홈 화면
  const [activeMenu, setActiveMenu] = useState('홈')
  const [activeCategory, setActiveCategory] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // 'home' | 'list' | 'detail' | 'write'
  const [viewMode, setViewMode] = useState('home')
  const [selectedPostId, setSelectedPostId] = useState(null)

  // 글쓰기 / 글수정 상태
  const [editingPostId, setEditingPostId] = useState(null)
  const [newCategory, setNewCategory] = useState('자유게시판')
  const [newTitle, setNewTitle] = useState('')
  const [commentInput, setCommentInput] = useState('')

  // 서식 편집기 참조
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [pendingEditorHtml, setPendingEditorHtml] = useState('')

  // 대문 사진
  const bannerInputRef = useRef(null)
  const [bannerUrl, setBannerUrl] = useState('')
  const [bannerUploading, setBannerUploading] = useState(false)

  // popstate(뒤로가기) 핸들러에서 최신 게시글 목록을 확인하기 위한 참조
  const postsRef = useRef([])
  postsRef.current = posts

  const isAdmin = Boolean(currentUser?.isAdmin)
  const menuItems = ['홈', '전체글', '인기글', '최신글', '공지사항']

  const writableCategories = isAdmin
    ? categories
    : categories.filter(cat => cat !== '공지사항')

  // ---------- 화면 이동 + 브라우저 히스토리 ----------

  // 저장된 화면 상태를 실제 화면에 반영
  function applyState(s) {
    let mode = s.viewMode
    let postId = s.selectedPostId ?? null

    // 글쓰기 화면은 뒤로/앞으로 가기로 복원하지 않음
    if (mode === 'write') mode = 'list'

    // 삭제된 글의 상세 화면으로 돌아가려 하면 목록으로
    if (mode === 'detail' && !postsRef.current.some(p => p.id === postId)) {
      mode = 'list'
      postId = null
    }

    setActiveMenu(s.activeMenu)
    setActiveCategory(s.activeCategory ?? null)
    setSelectedPostId(postId)
    setEditingPostId(null)
    setCommentInput('')
    setViewMode(mode)
  }

  function currentSnapshot() {
    return { activeMenu, activeCategory, viewMode, selectedPostId }
  }

  // 새 화면으로 이동하면서 히스토리에 기록 → 뒤로가기로 바로 이전 화면으로 돌아감
  function navigate(next) {
    const state = { ...currentSnapshot(), ...next }
    window.history.pushState(state, '')
    applyState(state)
  }

  // 글쓰기/수정 화면은 히스토리만 추가하고 화면 전환은 직접 처리
  function pushOnly(next) {
    const state = { ...currentSnapshot(), ...next }
    window.history.pushState(state, '')
  }

  // 최초 진입 상태 기록 + 뒤로가기/앞으로가기 처리
  useEffect(() => {
    window.history.replaceState(
      { activeMenu: '홈', activeCategory: null, viewMode: 'home', selectedPostId: null },
      ''
    )

    function handlePopState(e) {
      const s = e.state || {
        activeMenu: '홈',
        activeCategory: null,
        viewMode: 'home',
        selectedPostId: null,
      }
      applyState(s)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- 데이터 불러오기 ----------

  const fetchCommunityData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false })

      if (postsError) throw postsError

      if (!postsData || postsData.length === 0) {
        const { data: seeded, error: seedError } = await supabase
          .from('posts')
          .insert(initialPosts)
          .select()

        if (seedError) throw seedError
        setPosts((seeded || []).map(p => ({ ...p, commentList: [] })))
        setLoading(false)
        return
      }

      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .order('id', { ascending: true })

      if (commentsError) throw commentsError

      const commentMap = {}
      for (const c of commentsData || []) {
        if (!commentMap[c.post_id]) commentMap[c.post_id] = []
        commentMap[c.post_id].push(c)
      }

      const merged = postsData.map(p => ({
        ...p,
        commentList: commentMap[p.id] || [],
      }))

      setPosts(merged)
    } catch (err) {
      console.error('Supabase 데이터 불러오기 실패:', err)
      alert('Supabase 연결을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCommunityData()
  }, [fetchCommunityData])

  // 대문 사진 주소 불러오기
  useEffect(() => {
    async function fetchBanner() {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'banner_url')
        .maybeSingle()
      if (error) {
        console.error('대문 사진 불러오기 실패:', error)
        return
      }
      setBannerUrl(data?.value || '')
    }
    fetchBanner()
  }, [])

  // 이전 대문 사진 파일 삭제 (실패해도 무시)
  async function removeOldBannerFile(oldUrl) {
    try {
      const marker = '/banners/'
      const idx = oldUrl.indexOf(marker)
      if (idx === -1) return
      const path = decodeURIComponent(oldUrl.slice(idx + marker.length).split('?')[0])
      await supabase.storage.from('banners').remove([path])
    } catch (err) {
      console.error('이전 대문 사진 삭제 실패:', err)
    }
  }

  // 운영자: 대문 사진 업로드
  async function handleBannerUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !isAdmin) return

    setBannerUploading(true)
    try {
      const blob = await compressImageToBlob(file, 1600)
      const fileName = `banner-${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('banners')
        .upload(fileName, blob, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('banners').getPublicUrl(fileName)
      const newUrl = urlData.publicUrl

      const { error: saveError } = await supabase
        .from('site_settings')
        .upsert({ key: 'banner_url', value: newUrl })
      if (saveError) throw saveError

      const oldUrl = bannerUrl
      setBannerUrl(newUrl)
      if (oldUrl) removeOldBannerFile(oldUrl)
    } catch (err) {
      console.error(err)
      alert(`대문 사진 업로드 실패: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setBannerUploading(false)
    }
  }

  // 운영자: 대문 사진 기본값으로 되돌리기
  async function handleBannerReset() {
    if (!isAdmin || !bannerUrl) return
    if (!window.confirm('대문 사진을 삭제하고 기본 화면으로 되돌릴까요?')) return

    const { error } = await supabase
      .from('site_settings')
      .upsert({ key: 'banner_url', value: '' })
    if (error) {
      alert(`대문 사진 삭제 실패: ${error.message}`)
      console.error(error)
      return
    }
    removeOldBannerFile(bannerUrl)
    setBannerUrl('')
  }

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser))
      } else {
        localStorage.removeItem(USER_STORAGE_KEY)
      }
    } catch (err) {
      console.error('회원 정보 저장 실패:', err)
    }
  }, [currentUser])

  // 글쓰기/수정 화면 진입 시 에디터 초기 내용 세팅
  useEffect(() => {
    if (viewMode === 'write' && editorRef.current) {
      editorRef.current.innerHTML = pendingEditorHtml
    }
  }, [viewMode, pendingEditorHtml])

  const selectedPost = posts.find(p => p.id === selectedPostId) || null

  let visiblePosts = [...posts]

  if (activeCategory) {
    visiblePosts = visiblePosts.filter(post => post.game === activeCategory)
  } else if (activeMenu === '공지사항') {
    visiblePosts = visiblePosts.filter(
      post => post.game === '공지사항' || post.type === '공지사항'
    )
  } else if (activeMenu === '인기글') {
    visiblePosts = visiblePosts.filter(
      post => post.type === '인기글' || (post.likes || 0) >= 5
    )
  } else if (activeMenu === '최신글') {
    visiblePosts = visiblePosts.filter(post => post.game !== '공지사항')
  }

  const trimmedQuery = searchQuery.trim().toLowerCase()
  if (trimmedQuery) {
    visiblePosts = visiblePosts.filter(post =>
      post.title.toLowerCase().includes(trimmedQuery)
    )
  }

  if (!activeCategory && activeMenu === '전체글') {
    visiblePosts.sort((a, b) => {
      const aNotice = a.game === '공지사항' || a.type === '공지사항' ? 1 : 0
      const bNotice = b.game === '공지사항' || b.type === '공지사항' ? 1 : 0
      if (aNotice !== bNotice) return bNotice - aNotice
      return b.id - a.id
    })
  }

  // 홈 화면용: 게시판별 최신글
  const homeBoards = HOME_ORDER.map(name => {
    if (name === '최신글') {
      return {
        category: '최신글',
        isLatest: true,
        posts: posts
          .filter(p => p.game !== '공지사항' && p.type !== '공지사항')
          .sort((a, b) => b.id - a.id)
          .slice(0, HOME_LATEST_COUNT),
      }
    }
    return {
      category: name,
      isLatest: false,
      posts: posts
        .filter(p => p.game === name)
        .sort((a, b) => b.id - a.id)
        .slice(0, HOME_POSTS_PER_BOARD),
    }
  })

  // 에디터 서식 명령 실행
  function applyFormat(command, value = null) {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
  }

  // 이미지 파일 선택 시 에디터 본문에 삽입
  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressedDataUrl = await compressImage(file, 800)
      if (editorRef.current) {
        editorRef.current.focus()
        const imgHtml = `<div style="margin: 12px 0;"><img src="${compressedDataUrl}" alt="첨부 이미지" style="max-width: 100%; border-radius: 8px;" /></div><p><br></p>`
        document.execCommand('insertHTML', false, imgHtml)
      }
    } catch (err) {
      alert('이미지 처리 중 오류가 발생했습니다.')
      console.error(err)
    } finally {
      e.target.value = ''
    }
  }

  function openAuthModal(mode) {
    setAuthModal(mode)
    setNicknameInput('')
    setPasswordInput('')
  }

  function handleAuthSubmit(e) {
    e.preventDefault()
    const cleanName = nicknameInput.trim()
    const cleanPw = passwordInput.trim()

    if (!cleanName || !cleanPw) {
      alert('닉네임과 비밀번호를 모두 입력해주세요.')
      return
    }

    if (cleanName === ADMIN_NICKNAME) {
      if (authModal === 'signup') {
        alert('해당 닉네임은 운영자 전용입니다. 로그인을 이용해주세요.')
        return
      }
      if (cleanPw !== ADMIN_PASSWORD) {
        alert('운영자 비밀번호가 일치하지 않습니다.')
        return
      }
      setCurrentUser({ nickname: cleanName, isAdmin: true })
    } else {
      setCurrentUser({ nickname: cleanName, isAdmin: false })
    }

    setAuthModal(null)
    setNicknameInput('')
    setPasswordInput('')
  }

  function handleLogout() {
    setCurrentUser(null)
  }

  function selectMenu(menu) {
    navigate({
      activeMenu: menu,
      activeCategory: null,
      selectedPostId: null,
      viewMode: menu === '홈' ? 'home' : 'list',
    })
  }

  function selectCategory(category) {
    navigate({
      activeCategory: category,
      activeMenu: category === '공지사항' ? '공지사항' : '전체글',
      selectedPostId: null,
      viewMode: 'list',
    })
  }

  function openWriteForm() {
    const isNoticeContext = activeMenu === '공지사항' || activeCategory === '공지사항'
    setEditingPostId(null)
    setNewTitle('')
    setPendingEditorHtml('')

    if (isNoticeContext && isAdmin) {
      setNewCategory('공지사항')
    } else if (activeCategory && activeCategory !== '공지사항') {
      setNewCategory(activeCategory)
    } else {
      setNewCategory('자유게시판')
    }
    pushOnly({ viewMode: 'write' })
    setViewMode('write')
  }

  function openEditForm(post) {
    setEditingPostId(post.id)
    setNewCategory(post.game || '자유게시판')
    setNewTitle(post.title || '')
    // 기존 일반 텍스트 글도 줄바꿈 유지해서 에디터에 넣기
    const raw = post.content || ''
    const hasHtmlTag = /<[a-z][\s\S]*>/i.test(raw)
    setPendingEditorHtml(hasHtmlTag ? raw : raw.replace(/\n/g, '<br>'))
    pushOnly({ viewMode: 'write' })
    setViewMode('write')
  }

  async function handlePostClick(post) {
    const nextViews = (post.views || 0) + 1
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, views: nextViews } : p))
    )
    navigate({ viewMode: 'detail', selectedPostId: post.id })

    await supabase
      .from('posts')
      .update({ views: nextViews })
      .eq('id', post.id)
  }

  async function handleCreateOrUpdatePost(e) {
    e.preventDefault()
    const editorHtml = editorRef.current ? editorRef.current.innerHTML.trim() : ''
    const plainText = editorRef.current ? editorRef.current.innerText.trim() : ''
    const hasImage = editorHtml.includes('<img')

    if (!newTitle.trim() || (!plainText && !hasImage)) {
      alert('제목과 내용을 모두 입력해주세요.')
      return
    }

    if (newCategory === '공지사항' && !isAdmin) {
      alert('공지사항은 운영자만 작성하거나 수정할 수 있습니다.')
      return
    }

    const postType = newCategory === '공지사항' ? '공지사항' : '최신글'

    if (editingPostId !== null) {
      const { data, error } = await supabase
        .from('posts')
        .update({
          game: newCategory,
          title: newTitle.trim(),
          content: editorHtml,
          type: postType,
        })
        .eq('id', editingPostId)
        .select()
        .single()

      if (error) {
        alert(`게시글 수정 실패: ${error.message}`)
        console.error(error)
        return
      }

      const updatedId = editingPostId
      setPosts(prev =>
        prev.map(p =>
          p.id === updatedId
            ? { ...p, ...data, commentList: p.commentList || [] }
            : p
        )
      )
      setNewTitle('')
      setPendingEditorHtml('')
      navigate({ viewMode: 'detail', selectedPostId: updatedId })
      return
    }

    const authorName = currentUser ? currentUser.nickname : '익명 문파원'

    const { data, error } = await supabase
      .from('posts')
      .insert([
        {
          game: newCategory,
          title: newTitle.trim(),
          content: editorHtml,
          author: authorName,
          likes: 0,
          views: 1,
          type: postType,
        },
      ])
      .select()
      .single()

    if (error) {
      alert('게시글 등록 중 오류가 발생했습니다.')
      console.error(error)
      return
    }

    setMyPostIds(prev => [...prev, data.id])
    setPosts(prev => [{ ...data, commentList: [] }, ...prev])
    setNewTitle('')
    setPendingEditorHtml('')
    setSearchQuery('')

    if (newCategory === '공지사항') {
      navigate({
        viewMode: 'list',
        activeMenu: '공지사항',
        activeCategory: '공지사항',
        selectedPostId: null,
      })
    } else {
      navigate({
        viewMode: 'list',
        activeMenu: '전체글',
        activeCategory: null,
        selectedPostId: null,
      })
    }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('정말 이 게시글을 삭제할까요?')) return

    await supabase.from('comments').delete().eq('post_id', postId)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      alert(`게시글 삭제 실패: ${error.message}`)
      console.error(error)
      return
    }

    setPosts(prev => prev.filter(p => p.id !== postId))
    // 삭제 후에는 이전 화면(목록/홈)으로 되돌아감
    window.history.back()
  }

  async function handleToggleLike(postId) {
    const target = posts.find(p => p.id === postId)
    if (!target) return

    const alreadyLiked = likedPostIds.includes(postId)
    const nextLikes = alreadyLiked
      ? Math.max(0, (target.likes || 0) - 1)
      : (target.likes || 0) + 1

    setLikedPostIds(prev =>
      alreadyLiked ? prev.filter(id => id !== postId) : [...prev, postId]
    )
    setPosts(prev =>
      prev.map(p => (p.id === postId ? { ...p, likes: nextLikes } : p))
    )

    await supabase
      .from('posts')
      .update({ likes: nextLikes })
      .eq('id', postId)
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!commentInput.trim() || !selectedPost) return

    const authorName = currentUser ? currentUser.nickname : '익명 문파원'

    const { data, error } = await supabase
      .from('comments')
      .insert([
        {
          post_id: selectedPost.id,
          author: authorName,
          text: commentInput.trim(),
        },
      ])
      .select()
      .single()

    if (error) {
      alert('댓글 등록 중 오류가 발생했습니다.')
      console.error(error)
      return
    }

    setMyCommentIds(prev => [...prev, data.id])
    setPosts(prev =>
      prev.map(p =>
        p.id === selectedPost.id
          ? { ...p, commentList: [...p.commentList, data] }
          : p
      )
    )
    setCommentInput('')
  }

  async function handleDeleteComment(commentId) {
    if (!selectedPost) return
    if (!window.confirm('이 댓글을 삭제할까요?')) return

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)

    if (error) {
      alert(`댓글 삭제 실패: ${error.message}`)
      console.error(error)
      return
    }

    setPosts(prev =>
      prev.map(p =>
        p.id === selectedPost.id
          ? {
              ...p,
              commentList: p.commentList.filter(c => c.id !== commentId),
            }
          : p
      )
    )
  }

  const isNoticeBoard = activeMenu === '공지사항' || activeCategory === '공지사항'
  const canWrite = !isNoticeBoard || isAdmin
  const canEditOrDeletePost =
    selectedPost && (isAdmin || myPostIds.includes(selectedPost.id))

  return (
    <div className="app">
      <header className="header">
        <div className="logo" onClick={() => selectMenu('홈')}>
          GAME<span>COMMUNITY</span>
        </div>

        <nav>
          {menuItems.map(menu => (
            <a
              key={menu}
              className={
                activeMenu === menu &&
                !activeCategory &&
                (viewMode === 'list' || viewMode === 'home')
                  ? 'active'
                  : ''
              }
              onClick={() => selectMenu(menu)}
            >
              {menu}
            </a>
          ))}
        </nav>

        <div className="account">
          {currentUser ? (
            <>
              <span className="user-badge">
                {isAdmin ? `👑 ${currentUser.nickname} (운영자)` : `${currentUser.nickname}님`}
              </span>
              <button className="login" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button className="login" onClick={() => openAuthModal('login')}>
                로그인
              </button>
              <button className="signup" onClick={() => openAuthModal('signup')}>
                회원가입
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        <section
          className={`welcome ${bannerUrl ? 'has-banner' : ''}`}
          style={
            bannerUrl
              ? {
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${bannerUrl}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        >
          <p>ALL GAMES, ONE COMMUNITY</p>
          <h1>아산맹 문파</h1>
          <span>다양한 게임의 소식과 공략, 이야기를 나눠보세요.</span>

          {isAdmin && (
            <div className="banner-admin">
              <button
                type="button"
                className="login"
                disabled={bannerUploading}
                onClick={() => bannerInputRef.current?.click()}
              >
                {bannerUploading ? '업로드 중...' : '🖼️ 대문 사진 변경'}
              </button>
              {bannerUrl && (
                <button
                  type="button"
                  className="login"
                  disabled={bannerUploading}
                  onClick={handleBannerReset}
                >
                  사진 삭제
                </button>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleBannerUpload}
              />
            </div>
          )}
        </section>

        <div className="content">
          <section className="main-content">
            {viewMode === 'home' && (
              <>
                <div className="board-header">
                  <h2>🏠 게시판별 최신글</h2>
                  <button className="signup" onClick={openWriteForm}>
                    글쓰기
                  </button>
                </div>

                {loading ? (
                  <p>게시글을 불러오는 중...</p>
                ) : (
                  <div className="home-grid">
                    {homeBoards.map(board => (
                      <div className="home-card" key={board.category}>
                        <div className="home-card-header">
                          <h3>
                            {board.category === '공지사항'
                              ? `📢 ${board.category}`
                              : board.isLatest
                                ? '📝 최신글'
                                : board.category}
                          </h3>
                          <button
                            type="button"
                            className="home-more"
                            onClick={() =>
                              board.isLatest
                                ? selectMenu('최신글')
                                : selectCategory(board.category)
                            }
                          >
                            더보기 ›
                          </button>
                        </div>

                        {board.posts.length > 0 ? (
                          <ul className="home-post-list">
                            {board.posts.map(post => (
                              <li
                                key={post.id}
                                className="home-post-item"
                                onClick={() => handlePostClick(post)}
                              >
                                <span className="home-post-title">
                                  {board.isLatest && (
                                    <em className="home-post-board">[{post.game}] </em>
                                  )}
                                  {post.title}
                                  {post.commentList.length > 0 && (
                                    <em> [{post.commentList.length}]</em>
                                  )}
                                </span>
                                <small>{formatDateTime(post.created_at)}</small>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="home-empty">등록된 글이 없습니다.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {viewMode === 'write' && (
              <form className="write-form" onSubmit={handleCreateOrUpdatePost}>
                <h2>
                  {editingPostId !== null
                    ? '✏️ 게시글 수정'
                    : newCategory === '공지사항'
                      ? '📢 공지사항 작성'
                      : '✍️ 새 게시글 작성'}
                </h2>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                  {writableCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="제목을 입력하세요"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                />

                {/* 서식 툴바 */}
                <div className="editor-toolbar">
                  <button type="button" onClick={() => applyFormat('justifyLeft')} title="왼쪽 정렬">
                    왼쪽 정렬
                  </button>
                  <button type="button" onClick={() => applyFormat('justifyCenter')} title="가운데 정렬">
                    가운데 정렬
                  </button>
                  <button type="button" onClick={() => applyFormat('indent')} title="들여쓰기">
                    들여쓰기 →
                  </button>
                  <button type="button" onClick={() => applyFormat('outdent')} title="내어쓰기">
                    ← 내어쓰기
                  </button>
                  <button type="button" onClick={() => applyFormat('bold')} title="굵게">
                    <b>B</b>
                  </button>
                  <select
                    aria-label="글자 크기"
                    defaultValue="3"
                    onChange={e => applyFormat('fontSize', e.target.value)}
                  >
                    <option value="2">작은 글씨</option>
                    <option value="3">보통 글씨</option>
                    <option value="4">조금 크게</option>
                    <option value="5">큰 글씨</option>
                    <option value="6">아주 크게</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="이미지 넣기"
                  >
                    🖼️ 이미지 넣기
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                </div>

                {/* 서식 편집 본문 */}
                <div
                  ref={editorRef}
                  className="rich-editor"
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="내용을 입력하세요..."
                />

                <div className="form-actions">
                  <button
                    type="button"
                    className="login"
                    onClick={() => window.history.back()}
                  >
                    취소
                  </button>
                  <button type="submit" className="signup">
                    {editingPostId !== null
                      ? '수정 완료'
                      : newCategory === '공지사항'
                        ? '공지 등록하기'
                        : '등록하기'}
                  </button>
                </div>
              </form>
            )}

            {viewMode === 'detail' && selectedPost && (
              <div className="post-detail">
                <div className="detail-top">
                  <span className="badge">
                    {selectedPost.game === '공지사항' ? '📢 공지사항' : selectedPost.game}
                  </span>
                  {canEditOrDeletePost && (
                    <div className="detail-actions">
                      <button
                        type="button"
                        className="login"
                        onClick={() => openEditForm(selectedPost)}
                      >
                        수정하기
                      </button>
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => handleDeletePost(selectedPost.id)}
                      >
                        {isAdmin && !myPostIds.includes(selectedPost.id)
                          ? '운영자 권한 삭제'
                          : '삭제하기'}
                      </button>
                    </div>
                  )}
                </div>
                <h2>{selectedPost.title}</h2>
                <small>
                  작성자 {selectedPost.author || '익명 문파원'} · 작성{' '}
                  {formatDateTime(selectedPost.created_at, true)} · 조회{' '}
                  {(selectedPost.views || 0).toLocaleString()} · 추천 {selectedPost.likes || 0} · 댓글{' '}
                  {selectedPost.commentList.length}
                </small>
                <hr />
                <div
                  className="post-body"
                  dangerouslySetInnerHTML={{
                    __html: /<[a-z][\s\S]*>/i.test(selectedPost.content || '')
                      ? selectedPost.content
                      : (selectedPost.content || '').replace(/\n/g, '<br>'),
                  }}
                />

                <div className="like-area">
                  <button
                    type="button"
                    className={`like-btn ${likedPostIds.includes(selectedPost.id) ? 'liked' : ''}`}
                    onClick={() => handleToggleLike(selectedPost.id)}
                  >
                    👍 추천 {selectedPost.likes || 0}
                  </button>
                </div>

                <hr />

                <h3>💬 댓글 ({selectedPost.commentList.length})</h3>
                <form className="write-form" onSubmit={handleAddComment}>
                  <input
                    type="text"
                    placeholder="댓글을 입력하세요"
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                  />
                  <div className="form-actions">
                    <button type="submit" className="signup">
                      댓글 등록
                    </button>
                  </div>
                </form>

                {selectedPost.commentList.length > 0 ? (
                  selectedPost.commentList.map(comment => (
                    <div className="post" key={comment.id}>
                      <div className="comment-header">
                        <span>
                          <strong>{comment.author || '익명 문파원'}</strong>
                          <small style={{ marginLeft: 8, opacity: 0.6 }}>
                            {formatDateTime(comment.created_at, true)}
                          </small>
                        </span>
                        {(isAdmin || myCommentIds.includes(comment.id)) && (
                          <button
                            type="button"
                            className="comment-delete-btn"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <span>{comment.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="post">첫 번째 댓글을 남겨보세요!</p>
                )}

                <button className="more" onClick={() => window.history.back()}>
                  목록으로 돌아가기
                </button>
              </div>
            )}

            {viewMode === 'list' && (
              <>
                <div className="board-header">
                  <h2>
                    {activeCategory === '공지사항' || activeMenu === '공지사항'
                      ? '📢 공지사항'
                      : activeCategory
                        ? `📌 ${activeCategory}`
                        : activeMenu === '인기글'
                          ? '🔥 인기 게시글'
                          : activeMenu === '최신글'
                            ? '📝 최신 게시글'
                            : '📋 전체 게시글'}
                  </h2>
                  {canWrite && (
                    <button className="signup" onClick={openWriteForm}>
                      {isNoticeBoard && isAdmin ? '공지사항 쓰기' : '글쓰기'}
                    </button>
                  )}
                </div>

                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="🔍 게시글 제목 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="login"
                      onClick={() => setSearchQuery('')}
                    >
                      초기화
                    </button>
                  )}
                </div>

                {loading ? (
                  <p>게시글을 불러오는 중...</p>
                ) : visiblePosts.length > 0 ? (
                  visiblePosts.map(post => {
                    const isNotice = post.game === '공지사항' || post.type === '공지사항'
                    return (
                      <div
                        className="post clickable"
                        key={post.id}
                        onClick={() => handlePostClick(post)}
                      >
                        <span>
                          {isNotice ? '📢 [공지] ' : `${post.game} · `}
                          {post.author || '익명 문파원'}
                          {myPostIds.includes(post.id) ? ' (내 글)' : ''}
                        </span>
                        <strong>{post.title}</strong>
                        <small>
                          {formatDateTime(post.created_at)} · 추천 {post.likes || 0} · 댓글{' '}
                          {post.commentList.length} · 조회{' '}
                          {(post.views || 0).toLocaleString()}
                        </small>
                      </div>
                    )
                  })
                ) : (
                  <p>
                    {trimmedQuery
                      ? `'${searchQuery}'에 해당하는 게시글이 없습니다.`
                      : '아직 등록된 게시글이 없습니다.'}
                  </p>
                )}
              </>
            )}
          </section>

          <aside>
            <h2>📌 게시판 메뉴</h2>

            {categories.map(category => (
              <div
                className={`game ${activeCategory === category ? 'selected' : ''}`}
                key={category}
                onClick={() => selectCategory(category)}
              >
                {category === '공지사항' ? `📢 ${category}` : category} <b>›</b>
              </div>
            ))}

            <button className="more" onClick={() => selectMenu('전체글')}>
              전체 게시글 보기
            </button>
          </aside>
        </div>
      </main>

      {authModal && (
        <div className="modal-backdrop" onClick={() => setAuthModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>{authModal === 'login' ? '🔐 로그인' : '✨ 회원가입'}</h2>
            <form className="write-form" onSubmit={handleAuthSubmit}>
              <input
                type="text"
                placeholder="문파 닉네임을 입력하세요"
                value={nicknameInput}
                onChange={e => setNicknameInput(e.target.value)}
              />
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="login"
                  onClick={() => setAuthModal(null)}
                >
                  닫기
                </button>
                <button type="submit" className="signup">
                  {authModal === 'login' ? '로그인하기' : '가입하고 시작'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App