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
  '자유게시판',
  '문의사항',
]

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

  const [activeMenu, setActiveMenu] = useState('전체글')
  const [activeCategory, setActiveCategory] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [viewMode, setViewMode] = useState('list')
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

  const isAdmin = Boolean(currentUser?.isAdmin)
  const menuItems = ['전체글', '인기글', '최신글', '공지사항']

  const writableCategories = isAdmin
    ? categories
    : categories.filter(cat => cat !== '공지사항')

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
    setActiveMenu(menu)
    setActiveCategory(null)
    setEditingPostId(null)
    setViewMode('list')
    setSelectedPostId(null)
  }

  function selectCategory(category) {
    setActiveCategory(category)
    setActiveMenu(category === '공지사항' ? '공지사항' : '전체글')
    setEditingPostId(null)
    setViewMode('list')
    setSelectedPostId(null)
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
    setViewMode('write')
  }

  async function handlePostClick(post) {
    const nextViews = (post.views || 0) + 1
    setPosts(prev =>
      prev.map(p => (p.id === post.id ? { ...p, views: nextViews } : p))
    )
    setSelectedPostId(post.id)
    setEditingPostId(null)
    setCommentInput('')
    setViewMode('detail')

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

      setPosts(prev =>
        prev.map(p =>
          p.id === editingPostId
            ? { ...p, ...data, commentList: p.commentList || [] }
            : p
        )
      )
      setSelectedPostId(editingPostId)
      setEditingPostId(null)
      setNewTitle('')
      setPendingEditorHtml('')
      setViewMode('detail')
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
    setViewMode('list')

    if (newCategory === '공지사항') {
      setActiveMenu('공지사항')
      setActiveCategory('공지사항')
    } else {
      setActiveMenu('전체글')
      setActiveCategory(null)
    }
  }

  async function handleDeletePost(postId) {
    if (!window.confirm('정말 이 게시글을 삭제할까요?')) return

    await supabase.from('comments').delete().eq('post_id', postId)
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error)