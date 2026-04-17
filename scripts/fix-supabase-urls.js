const response = await fetch('https://api.supabase.com/v1/projects/etfeqblaeuhaobefxilp/config/auth', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    site_url: 'https://donccx.vercel.app',
    uri_allow_list: 'https://donccx.vercel.app,https://donccx.vercel.app/reset-password,https://donccx.vercel.app/primeiro-acesso'
  })
})
const data = await response.json()
console.log('Status:', response.status, JSON.stringify(data, null, 2))
