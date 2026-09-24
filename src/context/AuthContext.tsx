import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserAccount, UserRole, Permission, RoleDefinition } from '../types/index.ts';
import { StorageService } from '../services/storageService.ts';

interface AuthContextType {
  currentUser: UserAccount;
  currentRole: RoleDefinition;
  hasPermission: (permission: Permission) => boolean;
  canAccessDepartment: (departmentName: string) => boolean;
  switchUser: (user: UserAccount) => void;
  allUsers: UserAccount[];
  roles: RoleDefinition[];
  isAuthenticated: boolean;
  logout: () => void;
  loginAs: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_KEY = 'edutrack_active_user_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<UserAccount[]>(StorageService.getUsers());
  const [roles, setRoles] = useState<RoleDefinition[]>(StorageService.getRoles());
  
  // Default to Super Admin (singsabmc@gmail.com)
  const defaultAdmin = users.find(u => u.role === 'super_admin') || users[0];
  
  const [currentUser, setCurrentUser] = useState<UserAccount>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const match = users.find(u => u.id === parsed.id);
        if (match) return match;
      }
    } catch {
      // fallback
    }
    return defaultAdmin;
  });

  useEffect(() => {
    const unsub = StorageService.subscribe(() => {
      const updatedUsers = StorageService.getUsers();
      setUsers(updatedUsers);
      setRoles(StorageService.getRoles());
      const currentStillExists = updatedUsers.find(u => u.id === currentUser.id);
      if (currentStillExists) {
        setCurrentUser(currentStillExists);
      }
    });
    return unsub;
  }, [currentUser.id]);

  const currentRole = roles.find(r => r.code === currentUser.role) || roles[0];

  const hasPermission = (permission: Permission): boolean => {
    if (currentUser.role === 'super_admin') return true;
    return currentRole.permissions.includes(permission);
  };

  const canAccessDepartment = (departmentName: string): boolean => {
    if (currentUser.role === 'super_admin' || currentUser.role === 'admin_hr') {
      return true;
    }
    if (currentUser.role === 'supervisor') {
      return currentUser.department.toLowerCase() === departmentName.toLowerCase();
    }
    // Teacher or Employee can only see their own department
    return currentUser.department.toLowerCase() === departmentName.toLowerCase();
  };

  const switchUser = (user: UserAccount) => {
    setCurrentUser(user);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    StorageService.addAuditLog({
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: 'Session Role Switched',
      target: `Switched active session to ${user.fullName} (${user.role})`,
      ipAddress: '127.0.0.1'
    });
  };

  const loginAs = (role: UserRole) => {
    const userWithRole = users.find(u => u.role === role) || users[0];
    switchUser(userWithRole);
  };

  const logout = () => {
    // Reset to super admin demo session
    switchUser(defaultAdmin);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        hasPermission,
        canAccessDepartment,
        switchUser,
        allUsers: users,
        roles,
        isAuthenticated: true,
        logout,
        loginAs
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
