import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  closeInquiry,
  findActiveInquiry,
  getInquiry,
  getInquiryMessages,
  getMyInquiries,
  getUnreadCounts,
  markInquiryRead,
  sendInquiryReply,
  startInquiry,
} from '../../src/features/inquiries/inquiries.service'

interface Call {
  method: string
  args: unknown[]
}

const { inquiriesMocks } = vi.hoisted(() => ({
  inquiriesMocks: {
    from: vi.fn(),
    rpc: vi.fn(),
    resolve: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: inquiriesMocks.from,
    rpc: inquiriesMocks.rpc,
  },
}))

type ResolveResult = { data: unknown; error: unknown }

function makeQuery(table: string) {
  const calls: Call[] = []
  const query: Record<string, unknown> = {}
  const call = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args })
    return query
  }
  for (const method of [
    'select',
    'eq',
    'neq',
    'in',
    'or',
    'order',
    'insert',
    'update',
    'delete',
    'maybeSingle',
    'single',
  ]) {
    query[method] = call(method)
  }
  query.getCalls = () => calls
  query.table = table
  query.then = (resolve: (value: ResolveResult) => unknown) => {
    const raw = inquiriesMocks.resolve(table, calls) as ResolveResult
    let result = raw
    if (
      Array.isArray(raw.data) &&
      (calls.some((call) => call.method === 'maybeSingle') ||
        calls.some((call) => call.method === 'single'))
    ) {
      result =
        raw.data.length === 0
          ? { data: null, error: raw.error }
          : { data: raw.data[0], error: raw.error }
    }
    return Promise.resolve(result).then(resolve)
  }
  query.catch = (reject: (reason: unknown) => unknown) =>
    Promise.resolve(inquiriesMocks.resolve(table, calls) as ResolveResult).then(
      undefined,
      reject,
    )
  query.finally = (fn: () => unknown) =>
    Promise.resolve(inquiriesMocks.resolve(table, calls) as ResolveResult).finally(fn)
  return query
}

function inquiry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inq-1',
    listing_id: 'list-1',
    listing_title: 'Selkirk Amped Epic',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    subject: 'Is this available?',
    message: 'Hi, is this still for sale?',
    status: 'open',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    seller: { id: 'seller-1', store_name: 'Ace Paddles' },
    ...overrides,
  }
}

function resolveData(data: unknown) {
  return { data, error: null }
}

function resolveError(message: string, code = 'PGRST000') {
  return { data: null, error: { message, code, details: '', hint: '' } }
}

beforeEach(() => {
  vi.clearAllMocks()
  inquiriesMocks.from.mockImplementation((table: string) => makeQuery(table))
  inquiriesMocks.rpc.mockResolvedValue(resolveData(null))
  // Default: buyer names resolve to nothing.
  inquiriesMocks.resolve.mockImplementation((table: string, _calls: Call[]) => {
    if (table === 'public_profiles') return resolveData([])
    return resolveData(null)
  })
})

function callsFor(table: string): Call[] {
  const entry = inquiriesMocks.from.mock.results.find(
    (result) => (result.value as { table?: string }).table === table,
  )
  if (entry == null) return []
  const query = entry.value as unknown as { getCalls(): Call[] }
  return query.getCalls()
}

describe('getMyInquiries', () => {
  it('fetches buyer-scoped inquiries when the user is not a seller', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([inquiry()])
      if (table === 'public_profiles') return resolveData([{ id: 'buyer-1', display_name: null }])
      return resolveData(null)
    })

    const { data } = await getMyInquiries('buyer-1', null)

    expect(data).toHaveLength(1)
    expect(data?.[0].subject).toBe('Is this available?')
    const eqCall = callsFor('inquiries').find((call) => call.method === 'eq')
    expect(eqCall?.args).toEqual(['buyer_id', 'buyer-1'])
  })

  it('fetches buyer-or-seller inquiries when the user is a seller', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([])
      if (table === 'public_profiles') return resolveData([])
      return resolveData(null)
    })

    const { data } = await getMyInquiries('user-1', 'seller-1')

    expect(data).toEqual([])
    const orCall = callsFor('inquiries').find((call) => call.method === 'or')
    expect(orCall?.args).toEqual(['buyer_id.eq.user-1,seller_id.eq.seller-1'])
  })

  it('merges buyer display names from the public profiles view', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([inquiry({ buyer_id: 'buyer-9' })])
      if (table === 'public_profiles') {
        return resolveData([{ id: 'buyer-9', display_name: 'Juan dela Cruz' }])
      }
      return resolveData(null)
    })

    const { data } = await getMyInquiries('seller-1', 'seller-1')

    expect(data?.[0].buyer_name).toBe('Juan dela Cruz')
  })

  it('surfaces a query error', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveError('boom')
      return resolveData(null)
    })

    const { data, error } = await getMyInquiries('buyer-1', null)

    expect(data).toEqual([])
    expect(error?.message).toBe('boom')
  })
})

describe('getInquiry', () => {
  it('returns one participant-visible inquiry with the buyer name resolved', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([inquiry({ buyer_id: 'buyer-9' })])
      if (table === 'public_profiles') {
        return resolveData([{ id: 'buyer-9', display_name: 'Juan dela Cruz' }])
      }
      return resolveData(null)
    })

    const { data } = await getInquiry('inq-1')

    expect(data?.id).toBe('inq-1')
    expect(data?.buyer_name).toBe('Juan dela Cruz')
  })

  it('returns null when the inquiry is not found', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([])
      return resolveData(null)
    })

    const { data } = await getInquiry('nope')

    expect(data).toBeNull()
  })
})

describe('getInquiryMessages', () => {
  it('fetches thread messages oldest first', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiry_messages') {
        return resolveData([{ id: 'm1', message: 'first' }, { id: 'm2', message: 'second' }])
      }
      return resolveData(null)
    })

    const { data } = await getInquiryMessages('inq-1')

    expect(data).toHaveLength(2)
    const orderCall = callsFor('inquiry_messages').find((call) => call.method === 'order')
    expect(orderCall?.args).toEqual(['created_at', { ascending: true }])
  })
})

describe('getUnreadCounts', () => {
  it('counts inbound unread messages per inquiry', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiry_messages') {
        return resolveData([
          { id: 'm1', inquiry_id: 'a' },
          { id: 'm2', inquiry_id: 'a' },
          { id: 'm3', inquiry_id: 'b' },
        ])
      }
      return resolveData(null)
    })

    const { data, error } = await getUnreadCounts('buyer-1', ['a', 'b'])

    expect(error).toBeNull()
    expect(data.get('a')).toBe(2)
    expect(data.get('b')).toBe(1)
  })

  it('returns an empty map for an empty inquiry set', async () => {
    const { data, error } = await getUnreadCounts('buyer-1', [])

    expect(error).toBeNull()
    expect(data.size).toBe(0)
    expect(inquiriesMocks.from).not.toHaveBeenCalled()
  })
})

describe('markInquiryRead', () => {
  it('updates only inbound unread messages to read', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiry_messages') return resolveData(null)
      return resolveData(null)
    })

    const { error } = await markInquiryRead('inq-1', 'buyer-1')

    expect(error).toBeNull()
    const calls = callsFor('inquiry_messages')
    const updateCall = calls.find((call) => call.method === 'update')
    expect(updateCall?.args[0]).toEqual({ is_read: true })
    const neqCall = calls.find((call) => call.method === 'neq')
    expect(neqCall?.args).toEqual(['sender_id', 'buyer-1'])
  })
})

describe('findActiveInquiry', () => {
  it('filters to open or answered inquiries for the listing', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([inquiry()])
      if (table === 'public_profiles') return resolveData([])
      return resolveData(null)
    })

    const { data } = await findActiveInquiry('buyer-1', 'list-1')

    expect(data?.id).toBe('inq-1')
    const inCall = callsFor('inquiries').find((call) => call.method === 'in')
    expect(inCall?.args).toEqual(['status', ['open', 'answered']])
  })
})

describe('startInquiry', () => {
  it('inserts a trimmed inquiry with the buyer id', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([inquiry()])
      if (table === 'public_profiles') return resolveData([])
      return resolveData(null)
    })

    const { data, error } = await startInquiry('buyer-1', {
      listing_id: 'list-1',
      seller_id: 'seller-1',
      subject: '  Is this available?  ',
      message: '  Hi!  ',
    })

    expect(error).toBeNull()
    expect(data?.id).toBe('inq-1')
    const insertCall = callsFor('inquiries').find((call) => call.method === 'insert')
    expect(insertCall?.args[0]).toMatchObject({
      listing_id: 'list-1',
      buyer_id: 'buyer-1',
      seller_id: 'seller-1',
      subject: 'Is this available?',
      message: 'Hi!',
    })
  })

  it('falls back to the existing active inquiry on a unique violation', async () => {
    let inquiriesCalls = 0
    inquiriesMocks.resolve.mockImplementation((table: string, calls: Call[]) => {
      if (table === 'inquiries') {
        inquiriesCalls += 1
        const isInsert = calls.some((call) => call.method === 'insert')
        if (isInsert) {
          return { data: null, error: { code: '23505', message: 'duplicate', details: '', hint: '' } }
        }
        return resolveData([inquiry()])
      }
      if (table === 'public_profiles') return resolveData([])
      return resolveData(null)
    })

    const { data, error } = await startInquiry('buyer-1', {
      listing_id: 'list-1',
      seller_id: 'seller-1',
      subject: 'Is this available?',
      message: 'Hi!',
    })

    expect(error).toBeNull()
    expect(data?.id).toBe('inq-1')
    expect(inquiriesCalls).toBeGreaterThan(1)
  })
})

describe('sendInquiryReply', () => {
  it('calls the atomic reply RPC with trimmed-safe args', async () => {
    inquiriesMocks.rpc.mockResolvedValue(
      resolveData({
        id: 'm-new',
        inquiry_id: 'inq-1',
        sender_id: 'seller-1',
        message: 'Yes it is!',
        is_read: false,
        created_at: '2026-01-02T00:00:00.000Z',
      }),
    )

    const { data, error } = await sendInquiryReply('inq-1', 'Yes it is!')

    expect(error).toBeNull()
    expect(data?.id).toBe('m-new')
    expect(inquiriesMocks.rpc).toHaveBeenCalledWith('send_inquiry_reply', {
      p_inquiry_id: 'inq-1',
      p_message: 'Yes it is!',
    })
  })

  it('surfaces RPC errors', async () => {
    inquiriesMocks.rpc.mockResolvedValue(resolveError('inquiry is closed'))

    const { data, error } = await sendInquiryReply('inq-1', 'hello')

    expect(data).toBeNull()
    expect(error?.message).toBe('inquiry is closed')
  })

  it('surfaces stranger denial so the reply is rejected', async () => {
    inquiriesMocks.rpc.mockResolvedValue(resolveError('not a participant of this inquiry'))

    const { data, error } = await sendInquiryReply('inq-1', 'not my business')

    expect(data).toBeNull()
    expect(error?.message).toBe('not a participant of this inquiry')
    expect(inquiriesMocks.rpc).toHaveBeenCalledWith('send_inquiry_reply', {
      p_inquiry_id: 'inq-1',
      p_message: 'not my business',
    })
  })

  it('surfaces cross-seller denial (Seller B on Seller A listing)', async () => {
    inquiriesMocks.rpc.mockResolvedValue(resolveError('not a participant of this inquiry'))

    const { data, error } = await sendInquiryReply('inq-1', 'I am another seller')

    expect(data).toBeNull()
    expect(error?.message).toBe('not a participant of this inquiry')
  })

  it('surfaces closed-inquiry denial for buyer and seller alike', async () => {
    inquiriesMocks.rpc.mockResolvedValue(resolveError('inquiry is closed'))

    const buyer = await sendInquiryReply('inq-1', 'buyer too late')
    const seller = await sendInquiryReply('inq-1', 'seller too late')

    expect(buyer.error?.message).toBe('inquiry is closed')
    expect(seller.error?.message).toBe('inquiry is closed')
    expect(inquiriesMocks.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('closeInquiry', () => {
  it('updates the inquiry status to closed', async () => {
    inquiriesMocks.resolve.mockImplementation((table: string) => {
      if (table === 'inquiries') return resolveData([{ ...inquiry(), status: 'closed' }])
      return resolveData(null)
    })

    const { data, error } = await closeInquiry('inq-1')

    expect(error).toBeNull()
    expect(data?.status).toBe('closed')
    const updateCall = callsFor('inquiries').find((call) => call.method === 'update')
    expect(updateCall?.args[0]).toEqual({ status: 'closed' })
  })
})
