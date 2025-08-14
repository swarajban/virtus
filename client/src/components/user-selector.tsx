import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";
import { api, setCurrentUsername } from "@/lib/api-client";
import { LocalStorage } from "@/lib/storage";
import type { User as UserType } from "@shared/schema";

interface UserSelectorProps {
  compact?: boolean;
}

export function UserSelector({ compact = false }: UserSelectorProps) {
  const [users, setUsers] = useState<UserType[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load users and set initial selection
    const loadUsers = async () => {
      try {
        const userList = await api.getUsers();
        setUsers(userList);
        
        // Get previously selected user or default to first user
        const savedUsername = localStorage.getItem('selected-username');
        if (savedUsername && userList.some(u => u.username === savedUsername)) {
          setSelectedUser(savedUsername);
        } else if (userList.length > 0) {
          const defaultUser = userList[0].username;
          setSelectedUser(defaultUser);
          setCurrentUsername(defaultUser);
        }
      } catch (error) {
        console.error("Failed to load users:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadUsers();
  }, []);

  const handleUserChange = (username: string) => {
    setSelectedUser(username);
    setCurrentUsername(username);
    // Reinitialize storage with new user data
    LocalStorage.initialize().then(() => {
      // Reload the page to refresh all data for the new user
      window.location.reload();
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading users...</div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-muted-foreground" />
        <Select value={selectedUser} onValueChange={handleUserChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.username}>
                {user.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Account</CardTitle>
        <CardDescription>
          Select which user's data to view and edit
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <User className="h-5 w-5 text-muted-foreground" />
          <Select value={selectedUser} onValueChange={handleUserChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.username}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}