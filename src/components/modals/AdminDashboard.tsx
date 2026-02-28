import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { 
  LayoutDashboard, Users, Briefcase, Settings, LogOut, Search, Bell, TrendingUp, Activity, Clock, CheckCircle, Menu, X, ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight
} from 'lucide-react';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const revenueData = [
  { name: 'Jan', uv: 4000, pv: 2400, amt: 2400 },
  { name: 'Feb', uv: 3000, pv: 1398, amt: 2210 },
  { name: 'Mar', uv: 2000, pv: 9800, amt: 2290 },
  { name: 'Apr', uv: 2780, pv: 3908, amt: 2000 },
  { name: 'May', uv: 1890, pv: 4800, amt: 2181 },
  { name: 'Jun', uv: 2390, pv: 3800, amt: 2500 },
  { name: 'Jul', uv: 3490, pv: 4300, amt: 2100 },
];

const trafficData = [
  { name: 'Mon', Users: 400, Pros: 240 },
  { name: 'Tue', Users: 300, Pros: 139 },
  { name: 'Wed', Users: 200, Pros: 980 },
  { name: 'Thu', Users: 278, Pros: 390 },
  { name: 'Fri', Users: 189, Pros: 480 },
  { name: 'Sat', Users: 239, Pros: 380 },
  { name: 'Sun', Users: 349, Pros: 430 },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('Overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (!isOpen) return null;

  const stats = [
    { title: "Total Revenue", value: "$124,500", change: "+14.5%", trending: "up", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50", line: "from-emerald-400 to-emerald-600" },
    { title: "Active Pros", value: "2,842", change: "+5.2%", trending: "up", icon: Briefcase, color: "text-bird-blue", bg: "bg-bird-blue/10", line: "from-bird-blue to-bird-darkBlue" },
    { title: "Pending Approvals", value: "148", change: "-2.4%", trending: "down", icon: Clock, color: "text-bird-orange", bg: "bg-bird-orange/10", line: "from-bird-orange to-red-500" },
    { title: "New Users", value: "8,206", change: "+28.2%", trending: "up", icon: Users, color: "text-bird-yellow", bg: "bg-bird-yellow/10", line: "from-bird-yellow to-bird-gold" },
  ];

  const recentUsers = [
    { id: 1, name: "Alice Johnson", role: "Worker", status: "Active", date: "2 hrs ago", email: "alice@example.com" },
    { id: 2, name: "Bob Smith", role: "Client", status: "Pending", date: "5 hrs ago", email: "bob@example.com" },
    { id: 3, name: "Carlos Ray", role: "Worker", status: "Active", date: "1 day ago", email: "carlos@example.com" },
    { id: 4, name: "Diana Prince", role: "Client", status: "Inactive", date: "2 days ago", email: "diana@example.com" },
  ];

  const navItems = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Users & Pros", icon: Users },
    { name: "Services", icon: Briefcase },
    { name: "Finance Analytics", icon: Activity },
    { name: "Platform Settings", icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex bg-gray-50/90 backdrop-blur-xl overflow-hidden text-gray-900 font-sans">
      
      {/* Decorative Global Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-bird-blue/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-bird-yellow/5 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[30%] w-[20vw] h-[20vw] bg-bird-orange/5 rounded-full blur-[90px]" />
      </div>

      {/* Sidebar Overlay - Mobile */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -280, width: 280 }}
        animate={{ 
          x: isSidebarOpen ? 0 : -280,
          width: isSidebarCollapsed ? 88 : 280
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed lg:relative z-50 h-full bg-white/60 backdrop-blur-3xl border-r border-white/50 shadow-[4px_0_30px_rgba(255,165,0,0.05)] lg:shadow-[4px_0_30px_rgba(255,165,0,0.05)] flex flex-col"
      >
        <div className={`h-24 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-6'} border-b border-gray-100/50 transition-all duration-300`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-bird-orange to-red-500 flex shrink-0 items-center justify-center shadow-lg shadow-bird-orange/30 relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              <span className="text-white font-black text-xl relative z-10">F</span>
            </div>
            {!isSidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col overflow-hidden whitespace-nowrap">
                <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700 block leading-none">Fixlife</span>
                <span className="text-[10px] font-bold text-bird-orange tracking-widest uppercase">Admin Panel</span>
              </motion.div>
            )}
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors duration-300">
            <X size={20} />
          </button>
        </div>

        {/* Global Collapse Toggle for Desktop */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-500 hover:text-bird-orange hover:border-bird-orange shadow-sm z-50 transition-all duration-300"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'px-3' : 'px-4'} py-8 space-y-2 overflow-y-auto custom-scrollbar`}>
          {navItems.map((item) => {
            const isActive = activeTab === item.name;
            return (
              <div key={item.name} className="relative group/nav">
                <button
                  onClick={() => setActiveTab(item.name)}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-start gap-3 px-4'} py-3.5 rounded-2xl transition-all duration-500 group relative overflow-hidden
                    ${isActive 
                      ? 'text-bird-orange font-bold shadow-md border border-bird-orange/20 bg-white/80 backdrop-blur-md'
                      : 'text-gray-500 hover:bg-white/50 hover:text-gray-900 hover:shadow-sm font-medium border border-transparent backdrop-blur-sm'}`}
                >
                  {isActive && (
                    <motion.div layoutId="activeNavBg" className="absolute inset-0 bg-gradient-to-r from-bird-orange/10 to-transparent" />
                  )}
                  <item.icon size={20} className={`relative z-10 shrink-0 transition-colors duration-500 ${isActive ? 'text-bird-orange' : 'text-gray-400 group-hover:text-bird-orange'}`} />
                  
                  {!isSidebarCollapsed && (
                    <span className="relative z-10 whitespace-nowrap">{item.name}</span>
                  )}
                  
                  {isActive && (
                    <motion.div layoutId="activeNavIndicator" className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-bird-orange rounded-r-full shadow-[0_0_10px_rgba(255,165,0,0.5)]" />
                  )}
                </button>
                
                {/* Custom Tooltip when collapsed */}
                {isSidebarCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all whitespace-nowrap shadow-xl z-50">
                    {item.name}
                    <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User Profile Section at bottom */}
        <div className={`p-4 border-t border-gray-100/50 ${isSidebarCollapsed ? 'pb-6' : 'pb-6'}`}>
          {!isSidebarCollapsed ? (
            <div className="bg-gray-50 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] shrink-0">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                  <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Admin" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="overflow-hidden">
                <p className="font-bold text-gray-900 text-sm whitespace-nowrap truncate">Sarah Jenkins</p>
                <p className="text-gray-500 text-xs truncate">Super Admin</p>
              </div>
            </div>
          ) : (
             <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] mb-4 shrink-0 cursor-pointer">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                  <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Admin" className="w-full h-full object-cover" />
                </div>
             </div>
          )}

          <button onClick={onClose} className={`w-full flex items-center justify-center ${isSidebarCollapsed ? 'p-3' : 'gap-2 px-4 py-3.5'} rounded-xl border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all font-bold shadow-sm group`}>
            <LogOut size={18} className="shrink-0 group-hover:-translate-x-1 transition-transform" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Close Dashboard</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative z-10">
        
        {/* Top Header */}
        <header className="h-24 bg-white/40 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6 md:px-10 z-20 sticky top-0 shadow-[0_4px_30px_rgba(0,0,0,0.01)]">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-bird-blue hover:border-bird-blue/50 transition-colors shadow-sm"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-gray-900 hidden sm:block tracking-tight">
                {activeTab}
              </h1>
              <p className="text-sm text-gray-500 hidden sm:block font-medium">Welcome back, here's what's happening today.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="relative hidden md:block group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-bird-blue transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search users, pros, or transactions..." 
                className="w-80 pl-11 pr-4 py-2.5 bg-white/80 border border-gray-200 rounded-full text-sm outline-none focus:border-bird-blue focus:ring-4 focus:ring-bird-blue/10 transition-all shadow-sm backdrop-blur-md"
              />
            </div>
            
            <button className="relative p-2.5 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-bird-blue hover:border-bird-blue/30 hover:shadow-md transition-all">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-[2.5px] border-white" />
            </button>

            <div className="flex items-center gap-3 pl-4 md:pl-6 border-l border-gray-200">
              <div className="hidden md:block text-right">
                <p className="font-bold text-gray-900 text-sm">System Admin</p>
                <p className="text-bird-blue text-xs font-bold">Super User</p>
              </div>
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-bird-orange via-bird-yellow to-bird-blue p-[2px] shadow-md cursor-pointer hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                  <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Admin" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          
          <div className="max-w-[1600px] mx-auto space-y-8 pb-10">
            
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {stats.map((stat, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
                  key={stat.title}
                  className="bg-white/70 backdrop-blur-xl rounded-3xl p-6 border border-white shadow-xl shadow-gray-200/20 relative overflow-hidden group hover:-translate-y-1 transition-all duration-300"
                >
                  <div className={`absolute -right-10 -top-10 w-32 h-32 ${stat.bg} rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700`} />
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color} shadow-sm border border-white/50 backdrop-blur-md`}>
                      <stat.icon size={24} />
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${
                      stat.trending === 'up' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {stat.trending === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {stat.change}
                    </span>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-gray-500 text-sm font-semibold mb-1">{stat.title}</h3>
                    <p className="text-3xl font-black text-gray-900 tracking-tight">{stat.value}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              
              {/* Main Revenue Chart */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[420px]"
              >
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Revenue Overview</h3>
                    <p className="text-sm text-gray-500 font-medium">Monthly generated income vs projected</p>
                  </div>
                  <select className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-2 font-medium outline-none focus:ring-2 focus:ring-bird-blue/20">
                    <option>Last 6 Months</option>
                    <option>This Year</option>
                    <option>All Time</option>
                  </select>
                </div>
                
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0090FF" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#0090FF" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FFC20E" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#FFC20E" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                        itemStyle={{ fontWeight: 'bold' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      <Area type="monotone" name="Actual Revenue" dataKey="uv" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                      <Area type="monotone" name="Projected" dataKey="pv" stroke="#FFC20E" strokeWidth={3} fillOpacity={1} fill="url(#colorPv)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Traffic / User Growth Chart */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 p-6 flex flex-col h-[420px]"
              >
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">User Growth</h3>
                  <p className="text-sm text-gray-500 font-medium">Weekly active registrations</p>
                </div>
                
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trafficData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                      <Tooltip 
                        cursor={{fill: '#F3F4F6'}}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar dataKey="Users" fill="#0090FF" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pros" fill="#FF8000" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              
              {/* Recent Activity Table */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="lg:col-span-2 bg-white/70 backdrop-blur-xl rounded-3xl border border-white shadow-xl shadow-gray-200/20 overflow-hidden"
              >
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white/50">
                  <h3 className="text-lg font-bold text-gray-900">Recent Registrations</h3>
                  <button className="text-sm text-bird-blue font-bold hover:bg-bird-blue/10 px-4 py-2 rounded-xl transition-colors">View All Directory</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100">
                        <th className="px-6 py-4">User Details</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Timeline</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50/80 transition-colors group cursor-pointer">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-700 font-bold shadow-inner">
                                {user.name.charAt(0)}
                              </div>
                              <div>
                                <span className="font-bold text-gray-900 text-sm block">{user.name}</span>
                                <span className="text-gray-500 text-xs">{user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 bg-gray-100 rounded-lg text-xs font-bold ${user.role === 'Worker' ? 'text-bird-darkBlue' : 'text-gray-600'}`}>{user.role}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                              user.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                              user.status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {user.status === 'Active' && <CheckCircle size={12} />}
                              {user.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                            {user.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button className="p-2 text-gray-400 hover:text-bird-blue hover:bg-bird-blue/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                              <Settings size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {/* System Health */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl p-6 flex flex-col text-white relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-bird-blue/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-bird-orange/20 rounded-full blur-3xl" />
                
                <h3 className="text-lg font-bold mb-8 relative z-10 flex items-center gap-2">
                  <Activity size={20} className="text-bird-lightBlue" />
                  Live System Health
                </h3>
                
                <div className="space-y-8 flex-1 relative z-10">
                  <div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="font-semibold text-gray-400">Server CPU</span>
                      <span className="font-bold text-white">42%</span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden shadow-inner border border-gray-700">
                      <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: "42%" }} 
                        transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-bird-lightBlue to-bird-blue rounded-full relative" 
                      >
                         <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      </motion.div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="font-semibold text-gray-400">Database Load</span>
                      <span className="font-bold text-white">78%</span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden shadow-inner border border-gray-700">
                      <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: "78%" }} 
                        transition={{ duration: 1.5, delay: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-bird-yellow to-bird-orange rounded-full relative" 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="font-semibold text-gray-400">Storage API</span>
                      <span className="font-bold text-white">12%</span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden shadow-inner border border-gray-700">
                      <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: "12%" }} 
                        transition={{ duration: 1.5, delay: 1.2, ease: "easeOut" }}
                        className="h-full bg-emerald-500 rounded-full" 
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-800 relative z-10">
                  <button className="w-full py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all backdrop-blur-md border border-white/10 flex items-center justify-center gap-2 group">
                    Generate Full Report
                    <ArrowUpRight size={18} className="text-gray-400 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </motion.div>

            </div>
          </div>

        </div>
      </main>
    </div>
  );
};
